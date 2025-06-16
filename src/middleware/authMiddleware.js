'use strict';

const passport = require('passport');
const { AppError } = require('./errorHandler');
const { createLogger } = require('../utils/logger');
const logger = createLogger('middleware:auth');

/**
 * Middleware per l'autenticazione JWT
 * Verifica il token JWT e aggiunge l'utente alla richiesta
 */
const authenticate = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    // Errore durante l'autenticazione
    if (err) {
      logger.error({ err }, "Errore durante l'autenticazione");
      return next(AppError.authentication('Errore di autenticazione'));
    }

    // Token non valido o utente non trovato
    if (!user) {
      logger.warn(`Autenticazione fallita: ${info?.message || 'Token non valido'}`);
      return next(AppError.authentication(info?.message || 'Token non valido'));
    }

    // Autenticazione riuscita
    req.user = user;
    logger.debug(`Utente ${user.username} autenticato`);
    
    return next();
  })(req, res, next);
};

/**
 * Middleware per il controllo dei ruoli
 * Verifica che l'utente abbia uno dei ruoli specificati
 * @param {Array} roles - Ruoli consentiti
 */
const hasRole = (roles) => {
  return (req, res, next) => {
    // Verifica che l'utente sia autenticato
    if (!req.user) {
      logger.warn('Controllo ruoli fallito: utente non autenticato');
      return next(AppError.authentication('Utente non autenticato'));
    }

    // Converti il parametro roles in array se è una stringa
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    // Verifica che l'utente abbia almeno uno dei ruoli consentiti
    if (req.user.hasAnyRole(allowedRoles)) {
      logger.debug(`Utente ${req.user.username} ha il ruolo richiesto`);
      return next();
    }

    // L'utente non ha i ruoli richiesti
    logger.warn(`Accesso negato: l'utente ${req.user.username} non ha i ruoli richiesti`);
    return next(AppError.authorization('Non hai i permessi necessari per accedere a questa risorsa'));
  };
};

module.exports = {
  authenticate,
  hasRole
};