'use strict';

const BasePolicy = require('./BasePolicy');
const { createLogger } = require('../utils/logger');
const logger = createLogger('policies:searchResult');

/**
 * Policy per il modello SearchResult
 * Gestisce autorizzazioni per risultati ricerche con metadata e AI analysis
 */
class SearchResultPolicy extends BasePolicy {
  constructor() {
    super('SearchResult');
  }

  /**
   * Verifica se un utente può creare un risultato di ricerca
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} data - Dati del nuovo risultato
   * @returns {boolean} - True se l'utente può creare
   */
  async canCreate(user, data) {
    try {
      // Solo il sistema può creare SearchResult durante lo scraping
      if (!user.hasRole('system')) {
        logger.warn(`Tentativo di creare SearchResult direttamente da parte di ${user.username}`);
        return false;
      }

      // Verifica che non si stiano salvando contenuti protetti da copyright
      if (data.full_description || data.full_images || data.original_content) {
        logger.error(`Tentativo di salvare contenuti protetti da copyright nel SearchResult`);
        return false;
      }

      // Verifica che ci sia sempre un external_url
      if (!data.external_url) {
        logger.error(`SearchResult deve avere external_url per rispettare ToS`);
        return false;
      }

      return await super.canCreate(user, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in SearchResultPolicy.canCreate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può leggere un risultato di ricerca
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} searchResult - Risultato da leggere (opzionale per liste)
   * @returns {boolean} - True se l'utente può leggere
   */
  async canRead(user, searchResult = null) {
    try {
      // Per liste (searchResult è null), usa permissions dal database
      if (!searchResult) {
        return await super.canRead(user, this.modelName);
      }

      // AgencyAdmin può leggere tutti i risultati del tenant per analytics
      if (user.hasRole('AgencyAdmin')) {
        return await super.canRead(user, searchResult);
      }

      // RealEstateAgent e Buyer possono leggere solo risultati delle proprie ricerche
      return await super.canRead(user, searchResult);
    } catch (error) {
      logger.error({ err: error }, `Errore in SearchResultPolicy.canRead per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può aggiornare un risultato di ricerca
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} searchResult - Risultato da aggiornare
   * @param {Object} data - Dati di aggiornamento
   * @returns {boolean} - True se l'utente può aggiornare
   */
  async canUpdate(user, searchResult, data) {
    try {
      // Solo il sistema può aggiornare SearchResult
      if (!user.hasRole('system')) {
        logger.warn(`Tentativo di aggiornare SearchResult da parte di ${user.username}`);
        return false;
      }

      // Non si possono modificare i riferimenti base
      if (data.external_url && data.external_url !== searchResult.external_url) {
        logger.warn(`Tentativo di cambiare external_url in SearchResult`);
        return false;
      }

      // Verifica che non si stiano salvando contenuti protetti
      if (data.full_description || data.full_images || data.original_content) {
        logger.error(`Tentativo di salvare contenuti protetti da copyright nel SearchResult`);
        return false;
      }

      return await super.canUpdate(user, searchResult, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in SearchResultPolicy.canUpdate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può eliminare un risultato di ricerca
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} searchResult - Risultato da eliminare
   * @returns {boolean} - True se l'utente può eliminare
   */
  async canDelete(user, searchResult) {
    try {
      // Solo AgencyAdmin può eliminare risultati per cleanup
      if (!user.hasRole('AgencyAdmin')) {
        logger.warn(`Tentativo di eliminare SearchResult senza permessi da parte di ${user.username}`);
        return false;
      }

      return await super.canDelete(user, searchResult);
    } catch (error) {
      logger.error({ err: error }, `Errore in SearchResultPolicy.canDelete per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può marcare un risultato come favorito
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} searchResult - Risultato da marcare come favorito
   * @returns {boolean} - True se l'utente può marcare come favorito
   */
  async canFavorite(user, searchResult) {
    try {
      // Solo il proprietario della ricerca può marcare come favorito
      return await this.can('read', user, searchResult);
    } catch (error) {
      logger.error({ err: error }, `Errore in SearchResultPolicy.canFavorite per utente ${user?.id}`);
      return false;
    }
  }
}

module.exports = new SearchResultPolicy();
