// src/services/authorizationErrorService.js
'use strict';

const { AppError } = require('../middleware/errorHandler');
const { createLogger } = require('../utils/logger');
const logger = createLogger('services:authorizationError');

/**
 * Servizio per la gestione centralizzata degli errori di autorizzazione
 */
class AuthorizationErrorService {
  /**
   * Genera un errore di autorizzazione standardizzato
   * @param {string} action - Azione tentata (create, read, update, delete)
   * @param {string} resource - Tipo di risorsa
   * @param {Object} user - Utente che ha tentato l'azione
   * @param {Object} [details] - Dettagli aggiuntivi sull'errore
   * @returns {AppError} - Errore di autorizzazione formattato
   */
  createAuthorizationError(action, resource, user, details = null) {
    const userId = user?.id || 'unknown';
    const username = user?.username || 'unknown';
    
    // Log standardizzato dell'errore
    logger.warn({
      userId,
      username,
      action,
      resource,
      details
    }, `Accesso negato: l'utente ${username} non può ${action} su ${resource}`);
    
    // Messaggio di errore standardizzato
    const customMessage = details?.message;
    const message = customMessage || 
                    `Non hai i permessi necessari per ${this.formatAction(action)} ${this.formatResource(resource)}`;
    
    return AppError.authorization(message, details);
  }
  
  /**
   * Genera un errore per campi non autorizzati
   * @param {Array} fields - Campi non autorizzati
   * @param {string} resource - Tipo di risorsa
   * @param {Object} user - Utente che ha tentato l'azione
   * @returns {AppError} - Errore di autorizzazione formattato
   */
  createUnauthorizedFieldsError(fields, resource, user) {
    // Verifica che fields sia un array e abbia elementi
    if (!Array.isArray(fields) || fields.length === 0) {
      // Se non ci sono campi specifici, restituisci un errore di autorizzazione generico
      return this.createAuthorizationError('update', resource, user);
    }
    
    const details = { fields };
    const message = `Non sei autorizzato a modificare i seguenti campi: ${fields.join(', ')}`;
    
    logger.warn({
      userId: user?.id || 'unknown',
      username: user?.username || 'unknown',
      resource,
      unauthorizedFields: fields
    }, `Tentativo di modifica campi non autorizzati su ${resource}`);
    
    return AppError.authorization(message, details);
  }
  
  /**
   * Formatta l'azione per i messaggi di errore
   * @param {string} action - Azione (create, read, update, delete)
   * @returns {string} - Azione formattata
   * @private
   */
  formatAction(action) {
    const actionMap = {
      'create': 'creare',
      'read': 'visualizzare',
      'update': 'aggiornare',
      'delete': 'eliminare',
      'manage': 'gestire',
      'list': 'elencare'
    };
    
    return actionMap[action] || action;
  }
  
  /**
   * Formatta il nome della risorsa per i messaggi di errore
   * @param {string} resource - Nome della risorsa
   * @returns {string} - Nome della risorsa formattato
   * @private
   */
  formatResource(resource) {
    // Mappatura dei nomi delle risorse per una migliore leggibilità
    const resourceMap = {
      'User': 'utente',
      'Role': 'ruolo',
      'Filiale': 'filiale',
      'UserAbility': 'permesso utente',
      'Asset': 'asset',
      'Edificio': 'edificio',
      'Piano': 'piano',
      'Locale': 'locale'
      // Altri mapping possono essere aggiunti qui
    };
    
    return resourceMap[resource] || resource.toLowerCase();
  }
}

module.exports = new AuthorizationErrorService();