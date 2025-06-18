'use strict';

const abilityService = require('../services/abilityService');
const { AppError } = require('./errorHandler');
const { createLogger } = require('../utils/logger');
const logger = createLogger('middleware:permission');

/**
 * Middleware per verificare i permessi di un utente
 * @param {string} action - Azione da verificare (create, read, update, delete, manage)
 * @param {string|Function} subjectResolver - Nome del modello o funzione che restituisce il soggetto
 * @param {Function} conditions - Funzione opzionale che aggiunge condizioni per il controllo dei permessi
 * @returns {Function} - Middleware Express
 */
const checkPermission = (action, subjectResolver, conditions = null) => {
  return async (req, res, next) => {
    try {
      // Verifica che l'utente sia autenticato
      if (!req.user) {
        return next(AppError.authentication('Utente non autenticato'));
      }

      // Determina il soggetto
      let subject = typeof subjectResolver === 'function' ? await subjectResolver(req) : subjectResolver;
      if (!subject) {
        return next(AppError.authorization('Impossibile determinare il soggetto'));
      }

      // Verifica i permessi
      const ability = await abilityService.defineAbilityFor(req.user);
      
      // Se l'azione é di update/read su campi specifici, verifica i permessi su ciascun campo
      if(action === 'update' ) {
        const keys = Object.keys(req.body);

        keys.forEach((key) => {
          if(!ability.can(action, subject, key)) {
            return next(AppError.authorization(`Non hai i permessi di ${action} su ${subject} sul campo field ${key}`));
          }
        });
      } 

      if (ability.can(action, subject)) {
        // Aggiungi l'ability all'oggetto request per utilizzo successivo
        req.ability = ability;
        logger.debug(`Permesso accordato: ${req.user.username} può ${action} su ${typeof subject === 'string' ? subject : subject.__type}`);
        return next();
      }

      // L'utente non ha i permessi necessari
      logger.warn(`Permesso negato: ${req.user.username} non può ${action} su ${typeof subject === 'string' ? subject : subject.__type}`);
      return next(AppError.authorization(`Non hai i permessi per ${action} su ${typeof subject === 'string' ? subject : (subject.__type || 'oggetto')}`));
    } catch (error) {
      return next(AppError.authorization('Errore durante la verifica dei permessi'));
    }
  };
};

/**
 * Middleware per filtrare i risultati in base ai permessi dell'utente
 * @param {string} action - Azione da verificare (tipicamente 'read')
 * @param {string} subjectType - Nome del tipo di soggetto/modello
 * @returns {Function} - Middleware Express
 */
const filterByPermission = (action, subjectType) => {
  return async (req, res, next) => {
    try {
      // Verifica che l'utente sia autenticato
      if (!req.user) {
        logger.warn('Filtro permessi fallito: utente non autenticato');
        return next(AppError.authentication('Utente non autenticato'));
      }

      // Ottieni l'ability dell'utente
      const ability = await abilityService.defineAbilityFor(req.user);
      
      // Aggiungi l'ability all'oggetto request per utilizzo successivo
      req.ability = ability;
      
      // Trova tutte le regole applicabili a questo tipo di soggetto e azione
      const relevantRules = ability.rulesFor(action, subjectType);
      
      // Estrai le condizioni dalle regole
      const conditions = relevantRules
        .filter(rule => !rule.inverted && rule.conditions)
        .map(rule => rule.conditions);
      
      // Se ci sono condizioni, aggiungile al filtro della query
      if (conditions.length > 0) {
        // Se req.queryOptions non esiste, inizializzalo
        req.queryOptions = req.queryOptions || {};
        
        // Se c'è già una condizione where, la combiniamo con i nostri filtri di permesso
        if (req.queryOptions.where) {
          // Se ci sono più condizioni, le uniamo con OR
          if (conditions.length > 1) {
            req.queryOptions.where = {
              ...req.queryOptions.where,
              [Op.and]: [
                req.queryOptions.where,
                { [Op.or]: conditions }
              ]
            };
          } else {
            // Se c'è solo una condizione, la uniamo direttamente
            req.queryOptions.where = {
              ...req.queryOptions.where,
              ...conditions[0]
            };
          }
        } else {
          // Se non c'è una condizione where esistente, impostiamo direttamente le nostre
          if (conditions.length > 1) {
            req.queryOptions.where = { [Op.or]: conditions };
          } else {
            req.queryOptions.where = conditions[0];
          }
        }
      }
      
      logger.debug(`Filtro permessi applicato per ${req.user.username} su ${subjectType}`);
      next();
    } catch (error) {
      logger.error({ err: error }, 'Errore durante l\'applicazione del filtro permessi');
      next(AppError.authorization('Errore durante la filtrazione dei risultati in base ai permessi'));
    }
  };
};

module.exports = {
  checkPermission,
  filterByPermission
};