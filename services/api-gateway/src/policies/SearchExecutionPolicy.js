'use strict';

const BasePolicy = require('./BasePolicy');
const { createLogger } = require('../utils/logger');
const logger = createLogger('policies:searchExecution');

/**
 * Policy per il modello SearchExecution
 * Gestisce autorizzazioni per tracciamento esecuzioni ricerche
 */
class SearchExecutionPolicy extends BasePolicy {
  constructor() {
    super('SearchExecution');
  }

  /**
   * Verifica se un utente può creare un'esecuzione di ricerca
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} data - Dati della nuova esecuzione
   * @returns {boolean} - True se l'utente può creare
   */
  async canCreate(user, data) {
    try {
      // Solo il sistema può creare direttamente SearchExecution
      if (!user.hasRole('system')) {
        logger.warn(`Tentativo di creare SearchExecution direttamente da parte di ${user.username}`);
        return false;
      }

      return await super.canCreate(user, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in SearchExecutionPolicy.canCreate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può leggere un'esecuzione di ricerca
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} searchExecution - Esecuzione da leggere (opzionale per liste)
   * @returns {boolean} - True se l'utente può leggere
   */
  async canRead(user, searchExecution = null) {
    try {
      // Per liste (searchExecution è null), usa permissions dal database
      if (!searchExecution) {
        return await super.canRead(user, this.modelName);
      }

      // AgencyAdmin può leggere tutte le esecuzioni del tenant per monitoring
      if (user.hasRole('AgencyAdmin')) {
        return await super.canRead(user, searchExecution);
      }

      // Sistema può leggere tutto per debugging
      if (user.hasRole('system')) {
        return true;
      }

      // RealEstateAgent e Buyer possono leggere solo esecuzioni delle proprie ricerche
      return await super.canRead(user, searchExecution);
    } catch (error) {
      logger.error({ err: error }, `Errore in SearchExecutionPolicy.canRead per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può aggiornare un'esecuzione di ricerca
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} searchExecution - Esecuzione da aggiornare
   * @param {Object} data - Dati di aggiornamento
   * @returns {boolean} - True se l'utente può aggiornare
   */
  async canUpdate(user, searchExecution, data) {
    try {
      // Solo il sistema può aggiornare SearchExecution
      if (!user.hasRole('system')) {
        logger.warn(`Tentativo di aggiornare SearchExecution da parte di ${user.username}`);
        return false;
      }

      // Il sistema non può modificare saved_search_id
      if (data.saved_search_id && data.saved_search_id !== searchExecution.saved_search_id) {
        logger.warn(`Tentativo di cambiare saved_search_id in SearchExecution`);
        return false;
      }

      return await super.canUpdate(user, searchExecution, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in SearchExecutionPolicy.canUpdate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può eliminare un'esecuzione di ricerca
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} searchExecution - Esecuzione da eliminare
   * @returns {boolean} - True se l'utente può eliminare
   */
  async canDelete(user, searchExecution) {
    try {
      // Solo AgencyAdmin può eliminare esecuzioni per cleanup
      if (!user.hasRole('AgencyAdmin')) {
        logger.warn(`Tentativo di eliminare SearchExecution senza permessi da parte di ${user.username}`);
        return false;
      }

      // Non può eliminare esecuzioni in corso
      if (searchExecution.status === 'running') {
        logger.warn(`Tentativo di eliminare esecuzione in corso da parte di ${user.username}`);
        return false;
      }

      return await super.canDelete(user, searchExecution);
    } catch (error) {
      logger.error({ err: error }, `Errore in SearchExecutionPolicy.canDelete per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può cancellare un'esecuzione di ricerca in corso
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} searchExecution - Esecuzione da cancellare
   * @returns {boolean} - True se l'utente può cancellare
   */
  async canCancel(user, searchExecution) {
    try {
      // L'esecuzione deve essere in corso
      if (searchExecution.status !== 'running') {
        logger.warn(`Tentativo di cancellare esecuzione non in corso da parte di ${user.username}`);
        return false;
      }

      return await this.can('cancel', user, searchExecution);
    } catch (error) {
      logger.error({ err: error }, `Errore in SearchExecutionPolicy.canCancel per utente ${user?.id}`);
      return false;
    }
  }
}

module.exports = new SearchExecutionPolicy();
