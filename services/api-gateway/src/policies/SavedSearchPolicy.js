'use strict';

const BasePolicy = require('./BasePolicy');
const { createLogger } = require('../utils/logger');
const logger = createLogger('policies:savedSearch');

/**
 * Policy per il modello SavedSearch
 * Gestisce autorizzazioni per ricerche salvate real estate
 */
class SavedSearchPolicy extends BasePolicy {
  constructor() {
    super('SavedSearch');
  }

  /**
   * Verifica se un utente può creare una ricerca salvata
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} data - Dati della nuova ricerca
   * @returns {boolean} - True se l'utente può creare
   */
  async canCreate(user, data) {
    try {
      // Tutti i ruoli real estate possono creare ricerche salvate
      if (!user.hasAnyRole(['Buyer', 'RealEstateAgent', 'AgencyAdmin'])) {
        logger.warn(`Tentativo di creare ricerca salvata da utente senza ruolo real estate: ${user.username}`);
        return false;
      }

      // Se user_id è specificato, deve corrispondere all'utente corrente
      // (tranne per AgencyAdmin che può creare per altri utenti del tenant)
      if (data.user_id && data.user_id !== user.id) {
        if (!user.hasRole('AgencyAdmin')) {
          logger.warn(`Tentativo di creare ricerca per altro utente da parte di ${user.username}`);
          return false;
        }
      }

      // Verifica limiti sulla frequenza di esecuzione
      if (data.execution_frequency && data.execution_frequency < 300) { // min 5 minuti
        logger.warn(`Frequenza di esecuzione troppo alta richiesta da ${user.username}: ${data.execution_frequency}s`);
        return false;
      }

      return await super.canCreate(user, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in SavedSearchPolicy.canCreate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può leggere una ricerca salvata
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} savedSearch - Ricerca salvata da leggere (opzionale per liste)
   * @returns {boolean} - True se l'utente può leggere
   */
  async canRead(user, savedSearch = null) {
    try {
      // Per liste (savedSearch è null), usa permissions dal database
      if (!savedSearch) {
        return await super.canRead(user, this.modelName);
      }

      // AgencyAdmin può leggere tutte le ricerche del tenant per analytics
      if (user.hasRole('AgencyAdmin')) {
        return await super.canRead(user, savedSearch);
      }

      // RealEstateAgent e Buyer possono leggere solo le proprie ricerche
      if (savedSearch.user_id !== user.id) {
        logger.debug(`Accesso negato: ${user.username} ha tentato di leggere ricerca di altro utente`);
        return false;
      }

      return await super.canRead(user, savedSearch);
    } catch (error) {
      logger.error({ err: error }, `Errore in SavedSearchPolicy.canRead per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può aggiornare una ricerca salvata
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} savedSearch - Ricerca salvata da aggiornare
   * @param {Object} data - Dati di aggiornamento
   * @returns {boolean} - True se l'utente può aggiornare
   */
  async canUpdate(user, savedSearch, data) {
    try {
      // Non si può cambiare il proprietario della ricerca
      if (data.user_id && data.user_id !== savedSearch.user_id) {
        logger.warn(`Tentativo di cambiare proprietario ricerca da parte di ${user.username}`);
        return false;
      }

      // Solo il proprietario può modificare la ricerca
      if (savedSearch.user_id !== user.id) {
        logger.warn(`Tentativo di modificare ricerca altrui da parte di ${user.username}`);
        return false;
      }

      // Verifica limiti sulla frequenza di esecuzione
      if (data.execution_frequency && data.execution_frequency < 300) { // min 5 minuti
        logger.warn(`Frequenza di esecuzione troppo alta richiesta da ${user.username}: ${data.execution_frequency}s`);
        return false;
      }

      // Buyer non possono impostare frequenze troppo aggressive
      if (user.hasRole('Buyer') && data.execution_frequency && data.execution_frequency < 900) { // min 15 minuti per buyer
        logger.warn(`Buyer ${user.username} ha richiesto frequenza troppo alta: ${data.execution_frequency}s`);
        return false;
      }

      return await super.canUpdate(user, savedSearch, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in SavedSearchPolicy.canUpdate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può eliminare una ricerca salvata
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} savedSearch - Ricerca salvata da eliminare
   * @returns {boolean} - True se l'utente può eliminare
   */
  async canDelete(user, savedSearch) {
    try {
      // Solo il proprietario può eliminare la ricerca
      if (savedSearch.user_id !== user.id) {
        logger.warn(`Tentativo di eliminare ricerca altrui da parte di ${user.username}`);
        return false;
      }

      return await super.canDelete(user, savedSearch);
    } catch (error) {
      logger.error({ err: error }, `Errore in SavedSearchPolicy.canDelete per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può eseguire una ricerca salvata
   * Metodo custom per l'azione 'execute'
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} savedSearch - Ricerca salvata da eseguire
   * @returns {boolean} - True se l'utente può eseguire
   */
  async canExecute(user, savedSearch) {
    try {
      // Solo il proprietario può eseguire la ricerca
      if (savedSearch.user_id !== user.id) {
        logger.warn(`Tentativo di eseguire ricerca altrui da parte di ${user.username}`);
        return false;
      }

      // La ricerca deve essere attiva
      if (!savedSearch.is_active) {
        logger.warn(`Tentativo di eseguire ricerca disattivata da parte di ${user.username}`);
        return false;
      }

      // Verifica rate limiting (non più di una esecuzione ogni 5 minuti)
      if (savedSearch.last_executed_at) {
        const lastExecution = new Date(savedSearch.last_executed_at);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        if (lastExecution > fiveMinutesAgo) {
          logger.warn(`Rate limiting: ${user.username} ha tentato di eseguire ricerca troppo frequentemente`);
          return false;
        }
      }

      return await this.can('execute', user, savedSearch);
    } catch (error) {
      logger.error({ err: error }, `Errore in SavedSearchPolicy.canExecute per utente ${user?.id}`);
      return false;
    }
  }
}

module.exports = new SavedSearchPolicy();
