'use strict';

const { sequelize } = require('../models');
const { createLogger } = require('../utils/logger');
const logger = createLogger('middleware:db-context');

/**
 * Middleware per impostare il contesto utente nelle query PostgreSQL
 * Questo consente ai trigger del database di sapere quale utente sta effettuando le modifiche
 */
module.exports = async (req, res, next) => {
  try {
    // Se l'utente è autenticato, imposta il suo ID come variabile di sessione PostgreSQL
    if (req.user && req.user.id) {
      await sequelize.query("SELECT set_config('app.current_user_id', :userId, true)", {
        replacements: { userId: req.user.id }
      });
      
      logger.debug(`Set database user context to ${req.user.id}`);
    } else {
      // Se l'utente non è autenticato, rimuovi la variabile di sessione
      await sequelize.query("SELECT set_config('app.current_user_id', '', true)");
      
      logger.debug('Cleared database user context');
    }
  } catch (error) {
    // Non bloccare la richiesta se c'è un errore nell'impostazione del contesto
    logger.error({ err: error }, 'Error setting database user context');
  }
  
  next();
};