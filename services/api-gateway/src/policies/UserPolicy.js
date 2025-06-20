'use strict';

const BasePolicy = require('./BasePolicy');
const { createLogger } = require('../utils/logger');
const logger = createLogger('policies:user');

/**
 * Policy per il modello User
 * Implementa il nuovo sistema di autorizzazione centralizzato
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
      // Regole specifiche per evitare escalation di privilegi
      if (data.roles && Array.isArray(data.roles)) {
        // Se l'utente sta cercando di assegnare ruoli amministrativi, verifica che sia admin
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
      return await super.canCreate(user, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserPolicy.canCreate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può leggere un altro utente
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} targetUser - Utente da leggere
   * @returns {boolean} - True se l'utente può leggere
   */
  async canRead(user, targetUser) {
    try {
      // Un utente può sempre leggere il proprio profilo
      if (user.id === targetUser.id) {
        return true;
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
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
      // Un utente può aggiornare il proprio profilo ma non i propri ruoli
      if (user.id === targetUser.id) {
        // Se sta cercando di modificare i propri ruoli, verifica che sia amministratore
        if (data.roles && !user.hasRole('Amministratore di Sistema')) {
          logger.warn(`Tentativo di auto-modifica ruoli da parte di ${user.username}`);
          return false;
        }
        return true;
      }
      
      // Solo amministratori possono modificare altri amministratori
      if (targetUser.hasRole('Amministratore di Sistema') && !user.hasRole('Amministratore di Sistema')) {
        logger.warn(`Tentativo di modificare amministratore da parte di ${user.username}`);
        return false;
      }
      
      // Solo amministratori possono assegnare ruoli elevati
      if (data.roles && Array.isArray(data.roles)) {
        // Se l'utente sta cercando di assegnare ruoli amministrativi, verifica che sia admin
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
        logger.warn(`Tentativo di eliminare amministratore da parte di ${user.username}`);
        return false;
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await super.canDelete(user, targetUser);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserPolicy.canDelete per utente ${user?.id}`);
      return false;
    }
  }

  // Non serve più sovrascrivere getListConditions perché ora usa il metodo base
}

module.exports = new UserPolicy();