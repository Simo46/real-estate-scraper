'use strict';

const { createMongoAbility, AbilityBuilder } = require('@casl/ability');
const { createLogger } = require('../utils/logger');
const logger = createLogger('services:ability');
const { sequelize } = require('../models');
const { Op } = require('sequelize');
const conditionResolverService = require('./conditionResolverService');

/**
 * Definisce l'oggetto Ability per un utente in base ai suoi ruoli e permessi
 * Con supporto per ruolo attivo nel sistema multi-ruolo
 */
class AbilityService {
  /**
   * Crea un'istanza di Ability per l'utente specificato
   * @param {Object} user - Utente con i ruoli precaricati
   * @returns {Ability} - Istanza di CASL Ability
   */
  async defineAbilityFor(user) {
    try {
      // Se l'utente non è fornito o non ha ruoli, restituisci un'abilità vuota
      if (!user) {
        logger.debug('[abilityService - defineAbilityFor] - Definizione ability per utente non autenticato');
        return this.defineGuestAbility();
      }

      // NUOVO: Gestione multi-ruolo con ruolo attivo
      const allAbilities = await this.getAllAbilitiesForUser(user); 
      
      // Ordina le abilities in base alla priorità
      const sortedAbilities = this.sortAbilitiesByPriority(allAbilities);
      
      return this.buildAbility(sortedAbilities, user);
    } catch (error) {
      logger.error({ err: error }, `Errore nella definizione delle ability per utente ${user?.id}`);
      throw error;
    }
  }

  /**
   * Costruisce l'oggetto Ability usando CASL
   * @param {Array} abilities - Lista di abilities
   * @param {Object} user - Utente
   * @returns {Ability} - Istanza di CASL Ability
   */
  buildAbility(abilities, user) {
    const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

    // Prima applica tutte le regole CAN
    for (const ability of abilities) {
      logger.debug(`[abilityService - buildAbility] - Processing ability: ${ability.action} ${ability.subject} (inverted: ${ability.inverted}, ability.fields: ${JSON.stringify(ability.fields)})`);
      if (!ability.inverted) {
        this.applyAbility(can, cannot, ability, user);
      }
    }
  
    // Poi applica tutte le regole CANNOT
    for (const ability of abilities) {
      if (ability.inverted) {
        this.applyAbility(can, cannot, ability, user);
      }
    }

    return build(
      /**
       * Questo è come un "traduttore" che aiuta CASL a capire con cosa sta lavorando. 
       * Quando verifichi un'autorizzazione con ability.can('update', qualcosa), 
       * CASL deve sapere se qualcosa è una "Filiale", un "User" o altro.
       * Questa funzione dice:
       *   Se è null o una stringa (es. "Post"), usala direttamente
       *   Se è un oggetto, cerca la proprietà __type o usa il nome della classe (es. Post)
       */
      {
        detectSubjectType: (subject) => {
          if (!subject || typeof subject === 'string') {
            return subject;
          }
          return subject.__type || subject.constructor.name;
        }
      });
  }

  /**
   * Applica una singola ability all'oggetto AbilityBuilder
   * @param {Function} can - Funzione `can` di CASL
   * @param {Function} cannot - Funzione `cannot` di CASL
   * @param {Object} ability - Oggetto ability
   * @param {Object} user - Utente
   */
  applyAbility(can, cannot, ability, user) {
    logger.debug(`[abilityService - applyAbility] - Processing ability: ${ability.action} ${ability.subject} (inverted: ${ability.inverted})`);
    
    // Usa il metodo interno per risolvere le condizioni (MANTENUTO)
    if (ability.conditions) {
      ability.conditions = this.resolveConditions(ability.conditions, user);
      logger.debug(`[abilityService - applyAbility] - Resolved conditions: ${JSON.stringify(ability.conditions)}`);
    }

    if (ability.inverted) {
      cannot(ability.action, ability.subject, ability.fields || null, ability.conditions || {});
    } else {
      can(ability.action, ability.subject, ability.fields || null, ability.conditions || {});
    }
  }

  /**
   * Ottiene tutte le abilities di un utente (da ruoli e permessi individuali)
   * NUOVO: Con supporto per filtraggio ruolo attivo
   * @param {Object} user - Utente
   * @returns {Array} - Lista di abilities
   */
  async getAllAbilitiesForUser(user) {
    const roleAbilities = await this.extractAbilitiesFromUser(user);
    const userAbilities = user.id ? await this.extractIndividualAbilitiesFromUser(user) : [];
    return [...roleAbilities, ...userAbilities];
  }

  /**
   * Estrae tutti i permessi associati all'utente attraverso i suoi ruoli
   * NUOVO: Filtra per ruolo attivo se specificato
   * @param {Object} user - Utente con roles precaricati
   * @returns {Array} - Array di oggetti ability
   */
  async extractAbilitiesFromUser(user) {
    try {
      // Verifica che l'utente abbia i ruoli precaricati
      if (!user.roles || !Array.isArray(user.roles)) {
        logger.warn(`Utente ${user.id} non ha ruoli o i ruoli non sono stati precaricati`);
        return [];
      }
      
      // NUOVO: Filtraggio per ruolo attivo
      let rolesToProcess = user.roles;
      
      if (user.active_role_id) {
        // Se l'utente ha un ruolo attivo, usa solo quello
        rolesToProcess = user.roles.filter(role => role.id === user.active_role_id);
        
        if (rolesToProcess.length === 0) {
          logger.warn(`Ruolo attivo ${user.active_role_id} non trovato nei ruoli dell'utente ${user.username}`);
          return [];
        }
        
        logger.debug(`Filtraggio abilities per ruolo attivo: ${user.active_role_name} (${user.active_role_id})`);
      } else {
        // Fallback: se non c'è ruolo attivo, usa tutti i ruoli (comportamento legacy)
        logger.debug(`Nessun ruolo attivo specificato per utente ${user.username}, usando tutti i ruoli (legacy mode)`);
      }
      
      logger.debug(`Elaborazione abilities per ${rolesToProcess.length} ruoli: ${rolesToProcess.map(r => r.name).join(', ')}`);
      
      // Verifica se i ruoli hanno le abilities precaricate
      const abilitiesPreloaded = rolesToProcess.some(role => role.abilities && Array.isArray(role.abilities));
      
      if (abilitiesPreloaded) {
        // Log dettagliato per il debug
        rolesToProcess.forEach(role => {
          if (role.abilities) {
            logger.debug(`Ruolo ${role.name} ha ${role.abilities.length} abilities`);
          }
        });
        
        // Se le abilities sono già precaricate, le estrae direttamente
        const abilities = rolesToProcess.flatMap(role => {
          if (!role.abilities) return [];
          
          return role.abilities.map(ability => {
            // Se ability è un oggetto Sequelize, usa .get() per ottenere un oggetto puro
            const abilityData = typeof ability.get === 'function' ? ability.get() : ability;
            
            // Assicurati che i campi essenziali siano presenti
            return {
              action: abilityData.action,
              subject: abilityData.subject,
              conditions: abilityData.conditions || {},
              fields: abilityData.fields,
              inverted: abilityData.inverted === true,
              priority: abilityData.priority || 1,
              source: `role:${role.name}` // Per debug e audit
            };
          });
        });
        
        logger.debug(`Estratte ${abilities.length} abilities dai ruoli filtrati`);
        return abilities;
        
      } else {
        // Altrimenti, carica le abilities per ogni ruolo
        const { Role, Ability } = require('../models');
        
        // Ottieni gli ID dei ruoli da processare
        const roleIds = rolesToProcess.map(role => role.id);
        
        // Carica tutti i ruoli con le abilities
        const rolesWithAbilities = await Role.findAll({
          where: { id: roleIds },
          include: [{
            model: Ability,
            as: 'abilities'
          }]
        });
        
        // Estrai e restituisci tutte le abilities
        const abilities = rolesWithAbilities.flatMap(role => {
          const abilityList = role.abilities || [];
          return abilityList.map(ability => ({
            ...ability.get(),
            priority: ability.priority || 1,
            source: `role:${role.name}` // Per debug e audit
          }));
        });
        
        logger.debug(`Caricate ${abilities.length} abilities dai ruoli filtrati dal database`);
        return abilities;
      }
    } catch (error) {
      logger.error({ err: error }, `Errore nell'estrazione delle abilities per utente ${user.id}`);
      throw error;
    }
  }

  /**
   * AGGIORNATO: Estrae tutti i permessi individuali dell'utente con filtro per ruolo attivo
   * @param {Object} user - Utente
   * @returns {Array} - Array di oggetti userAbility
   */
  async extractIndividualAbilitiesFromUser(user) {
    try {
      // Verifica che l'utente abbia un ID
      if (!user.id) {
        logger.warn('Impossibile estrarre permessi individuali: utente senza ID');
        return [];
      }
      
      // Verifica se l'utente ha già le userAbilities precaricate
      if (user.userAbilities && Array.isArray(user.userAbilities)) {
        // Filtra per escludere quelle scadute E applica filtro role_context_id
        const validAbilities = user.userAbilities
          .filter(ability => !ability.isExpired())
          .filter(ability => {
            // NUOVO: Filtro per role_context_id
            // Se non ha role_context_id, si applica sempre (comportamento legacy)
            if (!ability.role_context_id) {
              logger.debug(`Permesso globale applicato: ${ability.action} on ${ability.subject}`);
              return true;
            }
            
            // Se ha role_context_id, deve corrispondere al ruolo attivo
            const applies = user.active_role_id === ability.role_context_id;
            logger.debug(`Permesso con contesto ruolo ${ability.role_context_id} ${applies ? 'applicato' : 'ignorato'} per ruolo attivo ${user.active_role_id}`);
            return applies;
          })
          .map(ability => ({
            ...ability.get(),
            // NUOVO: Calcola priorità effettiva (contesto ruolo = +10)
            priority: ability.getEffectivePriority(),
            source: 'individual' // Per debug e audit
          }));
        
        logger.debug(`Estratte ${validAbilities.length} abilities individuali per utente ${user.username} (ruolo attivo: ${user.active_role_id || 'nessuno'})`);
        return validAbilities;
      }
      
      // Altrimenti, carica le userAbilities per l'utente
      const { UserAbility } = require('../models');
      
      // Carica le abilities individuali non scadute
      const userAbilities = await UserAbility.findAll({
        where: {
          user_id: user.id,
          [Op.or]: [
            { expires_at: null },
            { expires_at: { [Op.gt]: new Date() } }
          ]
        }
      });
      
      // NUOVO: Applica filtro per role_context_id
      const filteredAbilities = userAbilities
        .filter(ability => {
          // Se non ha role_context_id, si applica sempre
          if (!ability.role_context_id) return true;
          
          // Se ha role_context_id, deve corrispondere al ruolo attivo
          return user.active_role_id === ability.role_context_id;
        });
      
      logger.debug(`Caricate ${filteredAbilities.length}/${userAbilities.length} abilities individuali per utente ${user.username} (filtrate per ruolo attivo)`);
      
      // Converti in oggetti plain per compatibilità
      return filteredAbilities.map(ability => ({
        ...ability.get(),
        priority: ability.getEffectivePriority(), // NUOVO: Calcola priorità effettiva
        source: 'individual' // Per debug e audit
      }));
    } catch (error) {
      logger.error({ err: error }, `Errore nell'estrazione delle abilities individuali per utente ${user.id}`);
      return []; // In caso di errore, restituisci un array vuoto
    }
  }

  /**
   * Definisce le abilities per un utente ospite (non autenticato)
   * @returns {Ability} - Istanza di CASL Ability con permessi minimi
   */
  defineGuestAbility() {
    const { can, build } = new AbilityBuilder(createMongoAbility);
    
    // Definisci le abilities minime per utenti non autenticati
    can('read', 'PublicContent');
    
    return build({
      detectSubjectType: (subject) => {
        if (!subject || typeof subject === 'string') {
          return subject;
        }
        
        return subject.__type || subject.constructor.name;
      }
    });
  }

  /**
   * AGGIORNATO: Ordina le abilities per priorità considerando la priorità effettiva
   * @param {Array} abilities - Lista di abilities
   * @returns {Array} - Lista ordinata di abilities
   */
  sortAbilitiesByPriority(abilities) {
    return abilities.sort((a, b) => {
      const priorityA = a.priority || 1;
      const priorityB = b.priority || 1;
      return priorityB - priorityA; // Priorità più alta prima
    });
  }

  /**
   * NUOVO: Ottiene l'elenco dei ruoli attivi possibili per un utente
   * @param {Object} user - Utente con ruoli precaricati
   * @returns {Array} - Array di ruoli utilizzabili
   */
  getAvailableRoles(user) {
    if (!user || !user.roles || !Array.isArray(user.roles)) {
      return [];
    }
    
    // Filtra solo i ruoli attivi
    const activeRoles = user.roles.filter(role => role.active !== false);
    
    return activeRoles.map(role => ({
      id: role.id,
      name: role.name,
      description: role.description,
      is_current: user.active_role_id === role.id,
      is_default: this.isDefaultRole(user, role.id),
      is_last_used: this.isLastUsedRole(user, role.id)
    }));
  }

  /**
   * NUOVO: Verifica se un ruolo è quello predefinito per l'utente
   * @param {Object} user - Utente
   * @param {string} roleId - ID del ruolo da verificare
   * @returns {boolean} - True se è il ruolo predefinito
   */
  isDefaultRole(user, roleId) {
    return user.settings?.auth?.default_role_id === roleId;
  }

  /**
   * NUOVO: Verifica se un ruolo è tra quelli usati di recente
   * @param {Object} user - Utente
   * @param {string} roleId - ID del ruolo da verificare
   * @returns {boolean} - True se è tra i ruoli usati di recente
   */
  isLastUsedRole(user, roleId) {
    const lastUsedRoles = user.settings?.auth?.last_used_roles || [];
    return lastUsedRoles.includes(roleId);
  }

  /**
   * NUOVO: Determina se l'utente può fare auto-login con il ruolo predefinito
   * @param {Object} user - Utente
   * @returns {boolean} - True se può fare auto-login
   */
  canAutoLoginWithDefaultRole(user) {
    if (!user.settings?.auth?.auto_login_with_default) {
      return false;
    }
    
    const defaultRoleId = user.settings.auth.default_role_id;
    if (!defaultRoleId) {
      return false;
    }
    
    // Verifica che il ruolo predefinito sia ancora valido
    return user.roles && user.roles.some(role => 
      role.id === defaultRoleId && role.active !== false
    );
  }

  // METODI MANTENUTI PER LA RISOLUZIONE DELLE CONDIZIONI (IMPORTANTE!)
  
  /**
   * Risolve le variabili dinamiche nelle condizioni
   * MANTENUTO: Fondamentale per la risoluzione di condizioni particolari sui permessi
   * @param {Object} conditions - Condizioni con potenziali variabili
   * @param {Object} user - Utente per la risoluzione
   * @returns {Object} - Condizioni con variabili risolte
   */
  resolveConditions(conditions, user) {
    // Copia profonda per non modificare l'originale
    const resolvedConditions = JSON.parse(JSON.stringify(conditions));
    
    // Funzione helper per ottenere un valore da un percorso nidificato
    function getNestedValue(obj, path) {
      const parts = path.split('.');
      let currentValue = obj;
      
      for (const part of parts) {
        if (currentValue === null || currentValue === undefined) {
          return undefined;
        }
        currentValue = currentValue[part];
      }
      
      return currentValue;
    }
    
    // Funzione per gestire casi speciali di risoluzione
    const resolveSpecialCases = (value, operator, user) => {      
      // Caso speciale per $in e $user.settings.managed_filiali (notazione diretta)
      if (operator === '$in' && value === '$user.settings.managed_filiali') {
        return getNestedValue(user, 'settings.managed_filiali');
      }
      
      // Nessun caso speciale, usiamo la risoluzione normale
      if (typeof value === 'string' && value.startsWith('$user.')) {
        const userPath = value.substring(6); // Rimuovi '$user.'
        return getNestedValue(user, userPath);
      }
      
      return value; // Valore non modificato se non ci sono casi speciali
    };
    
    // Attraversa ricorsivamente le condizioni
    const traverse = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          // Check if we're in an operator context like $in, $eq, etc.
          const isOperator = key.startsWith('$');
          
          if (isOperator && typeof obj[key] === 'string' && obj[key].startsWith('$user.')) {
            // Gestisci casi speciali per gli operatori
            obj[key] = resolveSpecialCases(obj[key], key, user);
          } else {
            // Continua con la ricorsione normale
            traverse(obj[key]);
          }
        } else if (typeof obj[key] === 'string' && obj[key].startsWith('$user.')) {
          // Gestione standard per i valori di tipo stringa
          obj[key] = resolveSpecialCases(obj[key], null, user);
        }
      }
    };
    
    traverse(resolvedConditions);
    logger.debug(`[abilityService] Condizioni risolte: ${JSON.stringify(resolvedConditions)}`);
    return resolvedConditions;
  }

  // Metodi legacy mantenuti per compatibilità
  async can(user, action, subject) {
    try {
      const ability = await this.defineAbilityFor(user);
      return ability.can(action, subject);
    } catch (error) {
      logger.error({ err: error }, `Errore nella verifica dei permessi per utente ${user?.id}`);
      return false;
    }
  }

  async cannot(user, action, subject) {
    try {
      const ability = await this.defineAbilityFor(user);
      return ability.cannot(action, subject);
    } catch (error) {
      logger.error({ err: error }, `Errore nella verifica dei permessi per utente ${user?.id}`);
      return true; // In caso di errore, nega l'accesso per sicurezza
    }
  }
}

module.exports = new AbilityService();