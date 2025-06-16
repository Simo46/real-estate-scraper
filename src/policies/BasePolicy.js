/**
 * Classe base per le policy dei modelli
 * Fornisce metodi comuni per il controllo dei permessi
 * Utilizza il permissionEvaluator per valutare condizioni complesse
 */
'use strict';

const abilityService = require('../services/abilityService');
const permissionEvaluator = require('../services/permissionEvaluator');
const { AppError } = require('../middleware/errorHandler');
const { createLogger } = require('../utils/logger');
const mongoToSequelize = require('../utils/mongoToSequelize');
const logger = createLogger('policies:base');

/**
 * Classe base per le policy dei modelli
 * Fornisce metodi comuni per il controllo dei permessi
 */
class BasePolicy {
  /**
   * Crea una nuova istanza di policy
   * @param {string} modelName - Nome del modello
   */
  constructor(modelName) {
    this.modelName = modelName;
  }

  /**
   * Verifica se un utente può eseguire un'azione su un oggetto
   * Interfaccia unificata per tutti i tipi di verifica
   * @param {string} action - Azione da verificare (create, read, update, delete, ecc.)
   * @param {Object} user - Utente che richiede l'accesso
   * @param {Object|string} resource - Risorsa o tipo di risorsa
   * @param {Object} data - Dati per l'azione (opzionale, per create/update)
   * @returns {boolean} True se l'utente è autorizzato
   */
  async can(action, user, resource, data = {}) {
    try {
      // Se l'utente non è fornito, non può fare nulla
      if (!user) {
        logger.warn(`Autorizzazione negata: utente non fornito per ${action} su ${this.modelName}`);
        return false;
      }

      // Ottieni l'ability CASL per l'utente
      const ability = await abilityService.defineAbilityFor(user);
      
      // Se resource è una stringa, assumiamo sia il tipo di risorsa
      const resourceType = typeof resource === 'string' ? resource : this.modelName;
      
      // Verifica base con CASL
      if (ability.cannot(action, resourceType)) {
        logger.debug(`Autorizzazione negata: ${user.username} non può ${action} su ${typeof resource === 'string' ? resource : this.modelName}`);
        return false;
      }
      
      // Se ci sono dati da verificare e si tratta di un'operazione di creazione o aggiornamento
      if (Object.keys(data).length > 0 && ['create', 'update'].includes(action)) {
        // La verifica dei campi consentiti viene gestita separatamente da verifyAllowedFields
        // e chiamata dal middleware, quindi qui non dobbiamo ripeterla
      }
      
      // Se la risorsa è un'istanza (non una stringa), verifica condizioni specifiche
      if (typeof resource !== 'string' && resource) {
        // Utilizziamo permissionEvaluator per valutare le regole
        // CORREZIONE: Usiamo il resourceType invece dell'istanza stessa
        const rules = ability.rulesFor(action, resourceType);
        if (rules.length === 0) {
          return false;
        }
        
        return permissionEvaluator.evaluateRules(rules, user, resource);
      }
      
      return true;
    } catch (error) {
      logger.error({ err: error }, `Errore durante la verifica dei permessi per ${action} su ${this.modelName}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può creare un'istanza del modello
   * @param {Object} user - Utente
   * @param {Object} data - Dati per la creazione
   * @returns {boolean} - True se l'utente può creare
   */
  async canCreate(user, data) {
    try {
      return await this.can('create', user, this.modelName, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in ${this.constructor.name}.canCreate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può leggere un'istanza del modello
   * @param {Object} user - Utente
   * @param {Object} instance - Istanza del modello
   * @returns {boolean} - True se l'utente può leggere
   */
  async canRead(user, instance) {
    try {
      // Se l'istanza non ha un tipo definito, lo aggiungiamo
      if (instance && !instance.__type) {
        instance.__type = this.modelName;
      }
      
      return await this.can('read', user, instance);
    } catch (error) {
      logger.error({ err: error }, `Errore in ${this.constructor.name}.canRead per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può aggiornare un'istanza del modello
   * @param {Object} user - Utente
   * @param {Object} instance - Istanza del modello
   * @param {Object} data - Dati di aggiornamento
   * @returns {boolean} - True se l'utente può aggiornare
   */
  async canUpdate(user, instance, data) {
    try {
      // Se l'istanza non ha un tipo definito, lo aggiungiamo
      if (instance && !instance.__type) {
        instance.__type = this.modelName;
      }
      
      return await this.can('update', user, instance, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in ${this.constructor.name}.canUpdate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può eliminare un'istanza del modello
   * @param {Object} user - Utente
   * @param {Object} instance - Istanza del modello
   * @returns {boolean} - True se l'utente può eliminare
   */
  async canDelete(user, instance) {
    try {
      // Se l'istanza non ha un tipo definito, lo aggiungiamo
      if (instance && !instance.__type) {
        instance.__type = this.modelName;
      }
      
      return await this.can('delete', user, instance);
    } catch (error) {
      logger.error({ err: error }, `Errore in ${this.constructor.name}.canDelete per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può elencare istanze del modello
   * Tipicamente usato per operazioni di lista/indice
   * @param {Object} user - Utente
   * @returns {boolean} - True se l'utente può elencare
   */
  async canList(user) {
    try {
      return await this.can('read', user, this.modelName);
    } catch (error) {
      logger.error({ err: error }, `Errore in ${this.constructor.name}.canList per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se i campi richiesti sono autorizzati per l'utente
   * @param {Object} user - Utente
   * @param {Object|string} resource - Risorsa o tipo di risorsa
   * @param {Object} data - Dati contenenti i campi da verificare
   * @param {string} action - Azione (default: 'update')
   * @returns {Object} Risultato della verifica { allowed: boolean, unauthorizedFields: string[], message: string }
   */
  async verifyAllowedFields(user, resource, data, action = 'update') {
    try {
      if (!user) {
        return {
          allowed: false,
          unauthorizedFields: [],
          message: 'Utente non autenticato'
        };
      }
      if (!data || Object.keys(data).length === 0) {
        return { 
          allowed: false,
          unauthorizedFields: [],
          message: 'Impossibile aggiornare senza dati' 
        };
      }
      
      // Ottieni l'ability CASL per l'utente
      const ability = await abilityService.defineAbilityFor(user);
      
      // Resource può essere una stringa (tipo) o un oggetto (istanza)
      const subject = typeof resource === 'string' ? resource : this.modelName;
      
      // Prima verifica se l'utente ha permesso generale sull'azione
      if (ability.cannot(action, subject)) {
        return {
          allowed: false,
          unauthorizedFields: [],
          message: `Non autorizzato per ${action} su ${subject}`
        };
      }
      
      // Verifica se ci sono regole con limitazioni esplicite di campi
      const rules = ability.rulesFor(action, subject);
      const hasFieldRestrictions = rules.some(rule => 
        !rule.inverted && rule.fields && rule.fields.length > 0
      );
      
      // Se non ci sono restrizioni esplicite sui campi, tutti i campi sono consentiti
      if (!hasFieldRestrictions) {
        return { allowed: true };
      }
      
      // Se ci sono limitazioni sui campi, verifica ogni campo
      const unauthorizedFields = [];
      
      Object.keys(data).forEach(field => {
        if (ability.cannot(action, subject, field)) {
          unauthorizedFields.push(field);
        }
      });
      
      // Se ci sono campi non autorizzati, restituisci errore
      if (unauthorizedFields.length > 0) {
        return {
          allowed: false,
          unauthorizedFields,
          message: `Non autorizzato a modificare i campi: ${unauthorizedFields.join(', ')}`
        };
      }
      
      return { allowed: true };
    } catch (error) {
      logger.error({ err: error }, `Errore durante la verifica dei campi consentiti per ${this.modelName}`);
      return {
        allowed: false,
        unauthorizedFields: [],
        message: 'Errore durante la verifica dei campi consentiti'
      };
    }
  }

  /**
   * Ottiene le condizioni di filtro per operazioni di elenco
   * @param {Object} user - Utente
   * @param {Object} existingConditions - Condizioni esistenti (opzionale)
   * @returns {Object} Condizioni combinate per filtrare le risorse
   */
  async getListConditions(user, existingConditions = {}) {
    try {
      // Ottieni l'ability CASL per l'utente
      const ability = await abilityService.defineAbilityFor(user);
      
      // Raccogli tutte le condizioni dalle regole pertinenti
      const rules = ability.rulesFor('read', this.modelName);
      
      // Estrai condizioni dalle regole non invertite
      const conditions = rules
        .filter(rule => !rule.inverted && rule.conditions)
        .map(rule => permissionEvaluator.resolveDynamicConditions(rule.conditions, user));
      
      // Se non ci sono condizioni speciali, restituisci quelle esistenti
      if (conditions.length === 0) {
        return existingConditions;
      }
      
      logger.debug(`Condizioni estratte per ${this.modelName}: ${JSON.stringify(conditions)}`);
      
      // Se ci sono più condizioni, combinale con OR
      let permissionConditions;
      if (conditions.length > 1) {
        permissionConditions = { $or: conditions };
      } else {
        permissionConditions = conditions[0];
      }
      
      // Converti le condizioni in formato Sequelize usando la versione migliorata
      const sequelizeConditions = mongoToSequelize(permissionConditions);
      
      logger.debug(`Condizioni convertite per ${this.modelName}: ${JSON.stringify(sequelizeConditions)}`);
      
      // Combina con le condizioni esistenti (AND)
      if (Object.keys(existingConditions).length > 0) {
        const { Op } = require('sequelize');
        return {
          [Op.and]: [
            existingConditions,
            sequelizeConditions
          ]
        };
      }
      
      return sequelizeConditions;
    } catch (error) {
      logger.error({ err: error }, `Errore durante la generazione delle condizioni di filtro per ${this.modelName}`);
      return existingConditions;
    }
  }

  /**
   * Ottiene i campi consentiti per la lettura per un utente
   * @param {Object} user - Utente
   * @param {Object} resource - Risorsa specifica (opzionale)
   * @returns {Array|null} - Array dei campi consentiti o null se tutti sono consentiti
   */
  async getAllowedReadFields(user, resource = null) {
    try {
      if (!user) {
        return null; // Utente non autenticato, nessun campo consentito
      }

      // Ottieni l'ability CASL per l'utente
      const ability = await abilityService.defineAbilityFor(user);
      
      // Verifica se ci sono regole con limitazioni specifiche sui campi per la lettura
      const rules = ability.rulesFor('read', this.modelName);
      const rulesWithFieldRestrictions = rules.filter(rule => 
        !rule.inverted && rule.fields && rule.fields.length > 0
      );
      
      // Se non ci sono restrizioni esplicite sui campi, tutti i campi sono consentiti
      if (rulesWithFieldRestrictions.length === 0) {
        return null;
      }
      
      // Se c'è una risorsa specifica, verifica se le regole si applicano
      const applicableRules = resource ? 
        rulesWithFieldRestrictions.filter(rule => {
          if (!rule.conditions) return true;
          return permissionEvaluator.evaluateRule(rule, user, resource);
        }) : 
        rulesWithFieldRestrictions;
      
      // Se nessuna regola si applica alla risorsa specifica, nessun campo è consentito
      if (applicableRules.length === 0) {
        return [];
      }
      
      // Raccogli tutti i campi consentiti dalle regole applicabili
      const allowedFields = new Set();
      
      applicableRules.forEach(rule => {
        if (rule.fields && rule.fields.length > 0) {
          rule.fields.forEach(field => allowedFields.add(field));
        }
      });
      
      return Array.from(allowedFields);
    } catch (error) {
      logger.error({ err: error }, `Errore durante il recupero dei campi consentiti per lettura su ${this.modelName}`);
      return null; // In caso di errore, consenti tutti i campi per sicurezza
    }
  }

  /**
   * Verifica se un utente può leggere campi specifici
   * @param {Object} user - Utente
   * @param {Object|string} resource - Risorsa o tipo di risorsa
   * @param {Array} fields - Campi da verificare
   * @returns {Object} Risultato della verifica { allowed: boolean, unauthorizedFields: string[], allowedFields: string[] }
   */
  async verifyReadableFields(user, resource, fields) {
    try {
      if (!user) {
        return {
          allowed: false,
          unauthorizedFields: fields,
          allowedFields: [],
          message: 'Utente non autenticato'
        };
      }
      
      if (!fields || !Array.isArray(fields) || fields.length === 0) {
        return { 
          allowed: true,
          unauthorizedFields: [],
          allowedFields: [],
          message: 'Nessun campo da verificare' 
        };
      }
      
      // Ottieni i campi consentiti per la lettura
      const allowedFields = await this.getAllowedReadFields(user, resource);
      
      // Se tutti i campi sono consentiti (nessuna restrizione)
      if (!allowedFields) {
        return {
          allowed: true,
          unauthorizedFields: [],
          allowedFields: fields,
          message: 'Tutti i campi sono consentiti'
        };
      }
      
      // Verifica quali campi non sono autorizzati
      const unauthorizedFields = fields.filter(field => !allowedFields.includes(field));
      const authorizedFields = fields.filter(field => allowedFields.includes(field));
      
      return {
        allowed: unauthorizedFields.length === 0,
        unauthorizedFields,
        allowedFields: authorizedFields,
        message: unauthorizedFields.length > 0 ? 
          `Campi non autorizzati: ${unauthorizedFields.join(', ')}` : 
          'Tutti i campi richiesti sono autorizzati'
      };
    } catch (error) {
      logger.error({ err: error }, `Errore durante la verifica dei campi leggibili per ${this.modelName}`);
      return {
        allowed: false,
        unauthorizedFields: fields,
        allowedFields: [],
        message: 'Errore durante la verifica dei campi'
      };
    }
  }

  /**
   * Filtra un oggetto mantenendo solo i campi che l'utente può leggere
   * @param {Object} user - Utente
   * @param {Object} data - Dati da filtrare
   * @param {Object} resource - Risorsa specifica (opzionale)
   * @returns {Object} - Dati filtrati
   */
  async filterReadableData(user, data, resource = null) {
    try {
      if (!user || !data) {
        return data;
      }
      
      // Ottieni i campi consentiti per la lettura
      const allowedFields = await this.getAllowedReadFields(user, resource);
      
      // Se tutti i campi sono consentiti, restituisci i dati originali
      if (!allowedFields) {
        return data;
      }
      
      // Se è un array, filtra ogni elemento
      if (Array.isArray(data)) {
        return data.map(item => this._filterObjectFields(item, allowedFields));
      }
      
      // Se è un oggetto, filtralo
      if (typeof data === 'object' && data !== null) {
        return this._filterObjectFields(data, allowedFields);
      }
      
      return data;
    } catch (error) {
      logger.error({ err: error }, `Errore durante il filtro dei dati leggibili per ${this.modelName}`);
      return data; // In caso di errore, restituisci i dati originali
    }
  }

  /**
   * Filtra i campi di un oggetto
   * @param {Object} obj - Oggetto da filtrare
   * @param {Array} allowedFields - Campi consentiti
   * @returns {Object} - Oggetto filtrato
   * @private
   */
  _filterObjectFields(obj, allowedFields) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    const filtered = {};
    
    // Mantieni sempre i campi essenziali
    const essentialFields = ['id', 'created_at', 'updated_at'];
    const allAllowedFields = [...new Set([...allowedFields, ...essentialFields])];
    
    allAllowedFields.forEach(field => {
      // Gestisci campi nidificati (es. "profile.name")
      if (field.includes('.')) {
        const [rootField, ...nestedPath] = field.split('.');
        if (obj.hasOwnProperty(rootField)) {
          if (!filtered[rootField]) {
            filtered[rootField] = obj[rootField];
          }
        }
      } else {
        // Campo semplice
        if (obj.hasOwnProperty(field)) {
          filtered[field] = obj[field];
        }
      }
    });
    
    return filtered;
  }
  /**
   * Autorizza un'azione o lancia un'eccezione
   * @param {boolean} condition - Risultato della verifica permessi
   * @param {string} message - Messaggio di errore
   * @throws {AppError} - Errore di autorizzazione
   */
  authorize(condition, message = 'Non autorizzato') {
    if (!condition) {
      throw AppError.authorization(message);
    }
  }
}

module.exports = BasePolicy;