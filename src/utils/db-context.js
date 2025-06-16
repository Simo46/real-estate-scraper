'use strict';

const { sequelize } = require('../models');
const { createLogger } = require('../utils/logger');
const logger = createLogger('utils:db-context');

/**
 * Utility per gestire il contesto utente nelle query PostgreSQL
 * Utile per script, cronjob, import e altre operazioni batch
 */
const dbContext = {
  /**
   * Imposta l'ID utente come contesto per le query successive
   * @param {string} userId - ID utente da impostare come contesto
   * @param {Object} options - Opzioni aggiuntive
   * @param {import('sequelize').Transaction} [options.transaction] - Transazione Sequelize opzionale
   * @returns {Promise<void>}
   */
  setUserId: async (userId, options = {}) => {
    try {
      const query = "SELECT set_config('app.current_user_id', :userId, true)";
      const replacements = { userId: userId || '' };
      
      if (options.transaction) {
        await sequelize.query(query, {
          replacements,
          transaction: options.transaction
        });
      } else {
        await sequelize.query(query, { replacements });
      }
      
      logger.debug(`Set database user context to ${userId || '[cleared]'}`);
    } catch (error) {
      logger.error({ err: error }, 'Error setting database user context');
      throw error;
    }
  },
  
  /**
   * Rimuove il contesto utente per le query successive
   * @param {Object} options - Opzioni aggiuntive
   * @param {import('sequelize').Transaction} [options.transaction] - Transazione Sequelize opzionale
   * @returns {Promise<void>}
   */
  clear: async (options = {}) => {
    await dbContext.setUserId('', options);
  },
  
  /**
   * Imposta un utente di sistema predefinito come contesto
   * Utile per cronjob e operazioni automatiche
   * @param {Object} options - Opzioni aggiuntive
   * @param {import('sequelize').Transaction} [options.transaction] - Transazione Sequelize opzionale
   * @returns {Promise<void>}
   */
  setSystemUser: async (options = {}) => {
    // L'ID dell'utente di sistema dovrebbe essere configurabile o preimpostato
    const SYSTEM_USER_ID = process.env.SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000';
    await dbContext.setUserId(SYSTEM_USER_ID, options);
  },
  
  /**
   * Esegue una funzione con un contesto utente specifico
   * @param {string} userId - ID utente da impostare come contesto
   * @param {Function} callback - Funzione da eseguire
   * @returns {Promise<any>} - Il risultato della funzione callback
   */
  withUserId: async (userId, callback) => {
    await dbContext.setUserId(userId);
    try {
      return await callback();
    } finally {
      await dbContext.clear();
    }
  },
  
  /**
   * Esegue una funzione con un contesto utente di sistema
   * @param {Function} callback - Funzione da eseguire
   * @returns {Promise<any>} - Il risultato della funzione callback
   */
  withSystemUser: async (callback) => {
    await dbContext.setSystemUser();
    try {
      return await callback();
    } finally {
      await dbContext.clear();
    }
  }
};

module.exports = dbContext;