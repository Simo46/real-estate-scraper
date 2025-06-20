'use strict';

const { body } = require('express-validator');

/**
 * Validazioni per le operazioni sui permessi individuali degli utenti
 */
const userAbilityValidators = {
  /**
   * Validazioni per la creazione di un permesso individuale
   */
  createUserAbility: [
    body('action')
      .notEmpty().withMessage('L\'azione è obbligatoria')
      .isLength({ min: 1 }).withMessage('L\'azione deve esistere'),
    
    body('subject')
      .notEmpty().withMessage('Il soggetto è obbligatorio')
      .isLength({ min: 1, max: 255 }).withMessage('Il soggetto deve essere compreso tra 1 e 255 caratteri'),
    
    body('conditions')
      .optional()
      .isObject().withMessage('Le condizioni devono essere un oggetto JSON valido'),
    
    body('fields')
      .optional()
      .isArray().withMessage('I campi devono essere un array'), 
    
    body('fields.*')
      .optional()
      .isString().withMessage('Ogni campo deve essere una stringa')
      .isLength({ min: 1, max: 100 }).withMessage('Ogni campo deve essere compreso tra 1 e 100 caratteri'), 
    
    body('inverted')
      .optional()
      .isBoolean().withMessage('Il valore deve essere un booleano')
      .toBoolean(), 
    
    body('priority')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('La priorità deve essere un numero intero tra 1 e 100')
      .toInt(), 
    
    body('reason')
      .optional()
      .isString().withMessage('Il motivo deve essere una stringa')
      .isLength({ max: 255 }).withMessage('Il motivo non può superare 255 caratteri')
      .trim(), 
    
    body('expires_at') 
      .optional()
      .isISO8601().withMessage('La data di scadenza deve essere in formato ISO8601')
      .custom((value) => {
        if (value && new Date(value) <= new Date()) {
          throw new Error('La data di scadenza deve essere futura');
        }
        return true;
      }),

    body('role_context_id')
      .optional()
      .isUUID(4).withMessage('L\'ID del ruolo di contesto deve essere un UUID valido') 
  ],

  /**
   * Validazioni per l'aggiornamento di un permesso individuale
   */
  updateUserAbility: [
    body('action')
      .optional()
      .isIn(['create', 'read', 'update', 'delete', 'manage']).withMessage('L\'azione deve essere una di: create, read, update, delete, manage'),
    
    body('subject')
      .optional()
      .notEmpty().withMessage('Il soggetto non può essere vuoto')
      .isLength({ min: 1, max: 255 }).withMessage('Il soggetto deve essere compreso tra 1 e 255 caratteri'),
    
    body('conditions')
      .optional()
      .isObject().withMessage('Le condizioni devono essere un oggetto JSON valido'),
    
    body('fields')
      .optional()
      .isArray({ max: 20 }).withMessage('I campi devono essere un array (massimo 20 elementi)'),
    
    body('fields.*')
      .optional()
      .isString().withMessage('Ogni campo deve essere una stringa')
      .isLength({ min: 1, max: 100 }).withMessage('Ogni campo deve essere compreso tra 1 e 100 caratteri'),
    
    body('inverted')
      .optional()
      .isBoolean().withMessage('Il valore deve essere un booleano')
      .toBoolean(),
    
    body('priority')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('La priorità deve essere un numero intero tra 1 e 100')
      .toInt(),
    
    body('reason')
      .optional()
      .isString().withMessage('Il motivo deve essere una stringa')
      .isLength({ max: 255 }).withMessage('Il motivo non può superare 255 caratteri')
      .trim(),
    
    body('expires_at')
      .optional()
      .custom((value) => {
        // Permetti null per rimuovere scadenza
        if (value === null) return true;
        
        // Se non è null, deve essere una data ISO valida e futura
        if (value && !new Date(value).toISOString()) {
          throw new Error('La data di scadenza deve essere in formato ISO8601');
        }
        
        if (value && new Date(value) <= new Date()) {
          throw new Error('La data di scadenza deve essere futura');
        }
        
        return true;
      }),

    body('role_context_id')
      .optional()
      .custom((value) => {
        // Permetti null per rimuovere il contesto
        if (value === null || value === undefined) return true;
        
        // Se specificato, deve essere un UUID valido
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (typeof value === 'string' && value.length > 0 && !uuidRegex.test(value)) {
          throw new Error('L\'ID del ruolo di contesto deve essere un UUID valido');
        }
        
        return true;
      })
  ],

  /**
   * Validazione per operazioni bulk sui permessi
   */
  bulkUpdateUserAbilities: [
    body('abilities')
      .isArray({ min: 1, max: 50 }).withMessage('Le abilities devono essere un array con almeno 1 elemento (massimo 50)'), // ✅ MIGLIORATO: Limiti array
    
    body('abilities.*.action')
      .notEmpty().withMessage('L\'azione è obbligatoria per ogni ability')
      .isIn(['create', 'read', 'update', 'delete', 'manage']).withMessage('L\'azione deve essere una di: create, read, update, delete, manage'),
    
    body('abilities.*.subject')
      .notEmpty().withMessage('Il soggetto è obbligatorio per ogni ability')
      .isLength({ min: 1, max: 255 }).withMessage('Il soggetto deve essere compreso tra 1 e 255 caratteri'),
    
    body('abilities.*.role_context_id')
      .optional()
      .isUUID(4).withMessage('L\'ID del ruolo di contesto deve essere un UUID valido'),
    
    body('abilities.*.priority')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('La priorità deve essere un numero intero tra 1 e 100')
      .toInt(),
      
    body('abilities.*.expires_at')
      .optional()
      .isISO8601().withMessage('La data di scadenza deve essere in formato ISO8601')
  ],

  /**
   * Validazione per query con filtro ruolo
   */
  queryByRoleContext: [
    body('role_id')
      .optional()
      .isUUID(4).withMessage('L\'ID del ruolo deve essere un UUID valido'),
    
    body('include_global')
      .optional()
      .isBoolean().withMessage('include_global deve essere un valore booleano')
      .toBoolean(),
      
    // ✅ AGGIUNTO: Validazioni per filtri aggiuntivi
    body('filters.active_only')
      .optional()
      .isBoolean().withMessage('active_only deve essere un valore booleano')
      .toBoolean(),
      
    body('filters.not_expired')
      .optional()
      .isBoolean().withMessage('not_expired deve essere un valore booleano')
      .toBoolean()
  ]
};

module.exports = userAbilityValidators;