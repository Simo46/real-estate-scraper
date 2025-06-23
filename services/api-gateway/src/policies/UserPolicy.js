'use strict';

const BasePolicy = require('./BasePolicy');
const { createLogger } = require('../utils/logger');
const logger = createLogger('policies:user');

/**
 * Policy per il modello User
 * Implementa autorizzazioni per utenti nel contesto Real Estate
 */
class UserPolicy extends BasePolicy {
  constructor() {
    super('User');
  }

  /**
   * Verifica se un utente può creare un nuovo utente
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} data - Dati del nuovo utente
   * @returns {boolean} - True se l'utente può creare
   */
  async canCreate(user, data) {
    try {
      // Solo admin e AgencyAdmin possono creare utenti
      if (!user.hasAnyRole(['admin', 'Amministratore di Sistema', 'AgencyAdmin'])) {
        logger.warn(`Tentativo di creare utente da parte di ${user.username} senza permessi`);
        return false;
      }

      // Regole specifiche per evitare escalation di privilegi
      if (data.roles && Array.isArray(data.roles)) {
        const hasSystemAdminRole = data.roles.some(role => 
          typeof role === 'string' 
            ? role === 'admin' || role === 'Amministratore di Sistema' 
            : (role.name === 'admin' || role.name === 'Amministratore di Sistema')
        );
        
        // Solo admin di sistema può assegnare ruoli amministrativi di sistema
        if (hasSystemAdminRole && !user.hasRole('Amministratore di Sistema')) {
          logger.warn(`Tentativo di assegnare ruoli amministrativi di sistema da parte di ${user.username}`);
          return false;
        }

        // AgencyAdmin può assegnare solo ruoli real estate (non system admin)
        if (user.hasRole('AgencyAdmin') && !user.hasRole('Amministratore di Sistema')) {
          const allowedRoles = ['RealEstateAgent', 'Buyer', 'user'];
          const invalidRoles = data.roles.filter(role => {
            const roleName = typeof role === 'string' ? role : role.name;
            return !allowedRoles.includes(roleName);
          });

          if (invalidRoles.length > 0) {
            logger.warn(`AgencyAdmin ${user.username} ha tentato di assegnare ruoli non consentiti: ${invalidRoles.map(r => typeof r === 'string' ? r : r.name).join(', ')}`);
            return false;
          }
        }
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await super.canCreate(user, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserPolicy.canCreate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può leggere un altro utente
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} targetUser - Utente da leggere (opzionale per liste)
   * @returns {boolean} - True se l'utente può leggere
   */
  async canRead(user, targetUser = null) {
    try {
      // Per liste (targetUser è null), usa permissions dal database
      if (!targetUser) {
        return await super.canRead(user, this.modelName);
      }

      // Un utente può sempre leggere il proprio profilo
      if (user.id === targetUser.id) {
        return true;
      }

      // AgencyAdmin può leggere tutti gli utenti del tenant
      if (user.hasRole('AgencyAdmin')) {
        return await super.canRead(user, targetUser);
      }

      // RealEstateAgent può leggere informazioni base di altri utenti del tenant
      if (user.hasRole('RealEstateAgent')) {
        return await super.canRead(user, targetUser);
      }

      // Buyer possono leggere solo il proprio profilo
      if (user.hasRole('Buyer')) {
        return user.id === targetUser.id;
      }
      
      // Delega la verifica al metodo base per altri ruoli
      return await super.canRead(user, targetUser);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserPolicy.canRead per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può aggiornare un altro utente
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} targetUser - Utente da aggiornare
   * @param {Object} data - Dati di aggiornamento
   * @returns {boolean} - True se l'utente può aggiornare
   */
  async canUpdate(user, targetUser, data) {
    try {
      // Un utente può aggiornare il proprio profilo ma con limitazioni sui ruoli
      if (user.id === targetUser.id) {
        // Se sta cercando di modificare i propri ruoli, verifica autorizzazioni
        if (data.roles) {
          // Solo admin di sistema può modificare i propri ruoli
          if (!user.hasRole('Amministratore di Sistema')) {
            logger.warn(`Tentativo di auto-modifica ruoli da parte di ${user.username}`);
            return false;
          }
        }

        // Verifica che non stia modificando campi sensibili
        if (data.tenant_id && data.tenant_id !== targetUser.tenant_id) {
          logger.warn(`Tentativo di auto-modifica tenant da parte di ${user.username}`);
          return false;
        }

        return true;
      }
      
      // Solo amministratori possono modificare altri amministratori di sistema
      if (targetUser.hasRole('Amministratore di Sistema') && !user.hasRole('Amministratore di Sistema')) {
        logger.warn(`Tentativo di modificare amministratore di sistema da parte di ${user.username}`);
        return false;
      }

      // AgencyAdmin può modificare utenti del proprio tenant con limitazioni
      if (user.hasRole('AgencyAdmin') && !user.hasRole('Amministratore di Sistema')) {
        // Non può modificare altri AgencyAdmin
        if (targetUser.hasRole('AgencyAdmin') && targetUser.id !== user.id) {
          logger.warn(`AgencyAdmin ${user.username} ha tentato di modificare altro AgencyAdmin`);
          return false;
        }

        // Non può assegnare ruoli di sistema
        if (data.roles && Array.isArray(data.roles)) {
          const systemRoles = ['admin', 'Amministratore di Sistema', 'system'];
          const hasSystemRole = data.roles.some(role => {
            const roleName = typeof role === 'string' ? role : role.name;
            return systemRoles.includes(roleName);
          });

          if (hasSystemRole) {
            logger.warn(`AgencyAdmin ${user.username} ha tentato di assegnare ruoli di sistema`);
            return false;
          }
        }

        // Non può modificare tenant_id
        if (data.tenant_id && data.tenant_id !== targetUser.tenant_id) {
          logger.warn(`AgencyAdmin ${user.username} ha tentato di modificare tenant_id`);
          return false;
        }
      }
      
      // Solo amministratori possono assegnare ruoli elevati
      if (data.roles && Array.isArray(data.roles)) {
        const hasAdminRole = data.roles.some(role => 
          typeof role === 'string' 
            ? role === 'admin' || role === 'Amministratore di Sistema' 
            : (role.name === 'admin' || role.name === 'Amministratore di Sistema')
        );
        
        if (hasAdminRole && !user.hasRole('Amministratore di Sistema')) {
          logger.warn(`Tentativo di assegnare ruoli amministrativi da parte di ${user.username}`);
          return false;
        }
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await super.canUpdate(user, targetUser, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserPolicy.canUpdate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può eliminare un altro utente
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} targetUser - Utente da eliminare
   * @returns {boolean} - True se l'utente può eliminare
   */
  async canDelete(user, targetUser) {
    try {
      // Un utente non può eliminare sé stesso
      if (user.id === targetUser.id) {
        logger.warn(`Tentativo di auto-eliminazione da parte di ${user.username}`);
        return false;
      }
      
      // Solo amministratori possono eliminare altri amministratori
      if (targetUser.hasRole('Amministratore di Sistema') && !user.hasRole('Amministratore di Sistema')) {
        logger.warn(`Tentativo di eliminare amministratore di sistema da parte di ${user.username}`);
        return false;
      }

      // AgencyAdmin non può eliminare altri AgencyAdmin
      if (user.hasRole('AgencyAdmin') && targetUser.hasRole('AgencyAdmin') && !user.hasRole('Amministratore di Sistema')) {
        logger.warn(`AgencyAdmin ${user.username} ha tentato di eliminare altro AgencyAdmin`);
        return false;
      }

      // Non si possono eliminare utenti con ricerche attive
      // Questa verifica potrebbe essere fatta a livello di controller per performance
      // ma la logica di business appartiene alla policy
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await super.canDelete(user, targetUser);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserPolicy.canDelete per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può assegnare un ruolo specifico a un altro utente
   * Metodo custom per l'azione 'assignRole'
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} targetUser - Utente a cui assegnare il ruolo
   * @param {string} roleName - Nome del ruolo da assegnare
   * @returns {boolean} - True se l'utente può assegnare il ruolo
   */
  async canAssignRole(user, targetUser, roleName) {
    try {
      // Solo admin e AgencyAdmin possono assegnare ruoli
      if (!user.hasAnyRole(['admin', 'Amministratore di Sistema', 'AgencyAdmin'])) {
        logger.warn(`Tentativo di assegnare ruolo da parte di ${user.username} senza permessi`);
        return false;
      }

      // Ruoli di sistema solo per admin di sistema
      const systemRoles = ['admin', 'Amministratore di Sistema', 'system'];
      if (systemRoles.includes(roleName) && !user.hasRole('Amministratore di Sistema')) {
        logger.warn(`Tentativo di assegnare ruolo di sistema ${roleName} da parte di ${user.username}`);
        return false;
      }

      // AgencyAdmin può assegnare solo ruoli real estate
      if (user.hasRole('AgencyAdmin') && !user.hasRole('Amministratore di Sistema')) {
        const allowedRoles = ['RealEstateAgent', 'Buyer', 'user'];
        if (!allowedRoles.includes(roleName)) {
          logger.warn(`AgencyAdmin ${user.username} ha tentato di assegnare ruolo non consentito: ${roleName}`);
          return false;
        }
      }

      // Non si può assegnare AgencyAdmin se il target è già un admin
      if (roleName === 'AgencyAdmin' && targetUser.hasRole('Amministratore di Sistema')) {
        logger.warn(`Tentativo di degradare admin di sistema a AgencyAdmin da parte di ${user.username}`);
        return false;
      }

      return await this.can('update', user, targetUser, { roles: [roleName] });
    } catch (error) {
      logger.error({ err: error }, `Errore in UserPolicy.canAssignRole per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può rimuovere un ruolo specifico da un altro utente
   * Metodo custom per l'azione 'removeRole'
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} targetUser - Utente da cui rimuovere il ruolo
   * @param {string} roleName - Nome del ruolo da rimuovere
   * @returns {boolean} - True se l'utente può rimuovere il ruolo
   */
  async canRemoveRole(user, targetUser, roleName) {
    try {
      // Non si può rimuovere il proprio ruolo di admin
      if (user.id === targetUser.id && (roleName === 'admin' || roleName === 'Amministratore di Sistema')) {
        logger.warn(`Tentativo di auto-rimozione ruolo admin da parte di ${user.username}`);
        return false;
      }

      // Solo admin di sistema può rimuovere ruoli di sistema
      const systemRoles = ['admin', 'Amministratore di Sistema', 'system'];
      if (systemRoles.includes(roleName) && !user.hasRole('Amministratore di Sistema')) {
        logger.warn(`Tentativo di rimuovere ruolo di sistema ${roleName} da parte di ${user.username}`);
        return false;
      }

      return await this.canAssignRole(user, targetUser, 'user'); // Se può assegnare, può anche rimuovere
    } catch (error) {
      logger.error({ err: error }, `Errore in UserPolicy.canRemoveRole per utente ${user?.id}`);
      return false;
    }
  }
}

module.exports = new UserPolicy();