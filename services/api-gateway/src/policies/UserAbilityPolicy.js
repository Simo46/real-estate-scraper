'use strict';

const BasePolicy = require('./BasePolicy');
const { createLogger } = require('../utils/logger');
const logger = createLogger('policies:userAbility');

/**
 * Policy per il modello UserAbility
 * Implementa il nuovo sistema di autorizzazione centralizzato
 */
class UserAbilityPolicy extends BasePolicy {
  constructor() {
    super('UserAbility');
  }

  /**
   * Verifica se un utente può creare una nuova abilità utente
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} data - Dati della nuova abilità utente
   * @returns {boolean} - True se l'utente può creare
   */
  async canCreate(user, data) {
    try {
      // Solo amministratori possono creare abilità personalizzate che danno forti privilegi
      if (data.action && ['manage', 'create', 'delete'].includes(data.action) && 
          data.subject && ['User', 'Role', 'Ability', 'UserAbility'].includes(data.subject)) {
        if (!user.hasRole('admin')) {
          logger.warn(`Tentativo di creare abilità privilegiata da parte di ${user.username}`);
          return false;
        }
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('create', user, this.modelName, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserAbilityPolicy.canCreate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può leggere un'abilità utente
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} userAbility - Abilità utente da leggere
   * @returns {boolean} - True se l'utente può leggere
   */
  async canRead(user, userAbility) {
    try {
      // Verifica che userAbility non sia undefined
      if (!userAbility) {
        logger.warn(`Tentativo di accesso a userAbility inesistente`);
        return false;
      }
      
      // Un utente può sempre leggere le proprie abilità
      if (user.id === userAbility.user_id) {
        return true;
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('read', user, userAbility);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserAbilityPolicy.canRead per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può aggiornare un'abilità utente
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} userAbility - Abilità utente da aggiornare
   * @param {Object} data - Dati di aggiornamento
   * @returns {boolean} - True se l'utente può aggiornare
   */
  async canUpdate(user, userAbility, data) {
    try {
      // Solo amministratori possono modificare abilità personalizzate che danno forti privilegi
      if (data.action && ['manage', 'create', 'delete'].includes(data.action) && 
          data.subject && ['User', 'Role', 'Ability', 'UserAbility'].includes(data.subject)) {
        if (!user.hasRole('Amministratore di Sistema')) {
          logger.warn(`Tentativo di modificare abilità privilegiata da parte di ${user.username}`);
          return false;
        }
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('update', user, userAbility, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserAbilityPolicy.canUpdate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può eliminare un'abilità utente
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} userAbility - Abilità utente da eliminare
   * @returns {boolean} - True se l'utente può eliminare
   */
  async canDelete(user, userAbility) {
    try {
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('delete', user, userAbility);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserAbilityPolicy.canDelete per utente ${user?.id}`);
      return false;
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
      return await super.getListConditions(user, existingConditions);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserAbilityPolicy.getListConditions per utente ${user?.id}`);
      return existingConditions;
    }
  }
}

module.exports = new UserAbilityPolicy();