'use strict';

const { body } = require('express-validator');

/**
 * Validazioni per le operazioni sui permessi individuali degli utenti
 * AGGIORNATO: Supporto per role_context_id
 */
const userAbilityValidators = {
  /**
   * AGGIORNATO: Validazioni per la creazione di un permesso individuale
   */
  createUserAbility: [
    body('action')
      .notEmpty().withMessage('L\'azione è obbligatoria')
      .isIn(['create', 'read', 'update', 'delete', 'manage']).withMessage('L\'azione deve essere una di: create, read, update, delete, manage'),
    
    body('subject')
      .notEmpty().withMessage('Il soggetto è obbligatorio'),
    
    body('conditions')
      .optional()
      .isObject().withMessage('Le condizioni devono essere un oggetto JSON valido'),
    
    body('fields')
      .optional()
      .isArray().withMessage('I campi devono essere un array'),
    
    body('fields.*')
      .optional()
      .isString().withMessage('Ogni campo deve essere una stringa'),
    
    body('inverted')
      .optional()
      .isBoolean().withMessage('Il valore deve essere un booleano'),
    
    body('priority')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('La priorità deve essere un numero intero tra 1 e 100'),
    
    body('reason')
      .optional()
      .isString().withMessage('Il motivo deve essere una stringa')
      .isLength({ max: 255 }).withMessage('Il motivo non può superare 255 caratteri'),
    
    body('expiresAt')
      .optional()
      .isISO8601().withMessage('La data di scadenza deve essere in formato ISO8601')
      .custom((value) => {
        if (value && new Date(value) <= new Date()) {
          throw new Error('La data di scadenza deve essere futura');
        }
        return true;
      }),

    // NUOVO: Validazione per role_context_id
    body('role_context_id')
      .optional()
      .isUUID().withMessage('L\'ID del ruolo di contesto deve essere un UUID valido')
      .custom(async (value, { req }) => {
        if (!value) return true; // Se null/undefined, è valido (permesso globale)
        
        // Verifica che l'utente target abbia effettivamente questo ruolo
        const targetUserId = req.params.userId;
        if (!targetUserId) {
          throw new Error('Impossibile validare role_context_id senza utente target');
        }
        
        const { UserRole } = require('../../models');
        const hasRole = await UserRole.findOne({
          where: {
            user_id: targetUserId,
            role_id: value,
            tenant_id: req.tenantId
          }
        });
        
        if (!hasRole) {
          throw new Error('L\'utente non ha il ruolo specificato come contesto');
        }
        
        return true;
      })
  ],

  /**
   * AGGIORNATO: Validazioni per l'aggiornamento di un permesso individuale
   */
  updateUserAbility: [
    body('action')
      .optional()
      .isIn(['create', 'read', 'update', 'delete', 'manage']).withMessage('L\'azione deve essere una di: create, read, update, delete, manage'),
    
    body('subject')
      .optional()
      .notEmpty().withMessage('Il soggetto non può essere vuoto'),
    
    body('conditions')
      .optional()
      .isObject().withMessage('Le condizioni devono essere un oggetto JSON valido'),
    
    body('fields')
      .optional()
      .isArray().withMessage('I campi devono essere un array'),
    
    body('fields.*')
      .optional()
      .isString().withMessage('Ogni campo deve essere una stringa'),
    
    body('inverted')
      .optional()
      .isBoolean().withMessage('Il valore deve essere un booleano'),
    
    body('priority')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('La priorità deve essere un numero intero tra 1 e 100'),
    
    body('reason')
      .optional()
      .isString().withMessage('Il motivo deve essere una stringa')
      .isLength({ max: 255 }).withMessage('Il motivo non può superare 255 caratteri'),
    
    body('expiresAt')
      .optional()
      .isISO8601().withMessage('La data di scadenza deve essere in formato ISO8601')
      .custom((value) => {
        if (value && new Date(value) <= new Date()) {
          throw new Error('La data di scadenza deve essere futura');
        }
        return true;
      }),

    // NUOVO: Validazione per role_context_id nell'aggiornamento
    body('role_context_id')
      .optional()
      .custom(async (value, { req }) => {
        // Se value è null o undefined, è valido (rimuove il contesto ruolo)
        if (value === null || value === undefined) return true;
        
        // Se è una stringa, deve essere un UUID valido
        if (typeof value === 'string' && value.length > 0) {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(value)) {
            throw new Error('L\'ID del ruolo di contesto deve essere un UUID valido');
          }
          
          // Verifica che l'utente target abbia questo ruolo
          const targetUserId = req.params.userId;
          if (!targetUserId) {
            throw new Error('Impossibile validare role_context_id senza utente target');
          }
          
          const { UserRole } = require('../../models');
          const hasRole = await UserRole.findOne({
            where: {
              user_id: targetUserId,
              role_id: value,
              tenant_id: req.tenantId
            }
          });
          
          if (!hasRole) {
            throw new Error('L\'utente non ha il ruolo specificato come contesto');
          }
        }
        
        return true;
      })
  ],

  /**
   * NUOVO: Validazione specifica per operazioni bulk sui permessi con contesto ruolo
   */
  bulkUpdateUserAbilities: [
    body('abilities')
      .isArray().withMessage('Le abilities devono essere un array')
      .notEmpty().withMessage('Almeno una ability deve essere specificata'),
    
    body('abilities.*.action')
      .notEmpty().withMessage('L\'azione è obbligatoria per ogni ability')
      .isIn(['create', 'read', 'update', 'delete', 'manage']).withMessage('L\'azione deve essere una di: create, read, update, delete, manage'),
    
    body('abilities.*.subject')
      .notEmpty().withMessage('Il soggetto è obbligatorio per ogni ability'),
    
    body('abilities.*.role_context_id')
      .optional()
      .isUUID().withMessage('L\'ID del ruolo di contesto deve essere un UUID valido'),
    
    body('abilities.*.priority')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('La priorità deve essere un numero intero tra 1 e 100')
  ],

  /**
   * NUOVO: Validazione per query con filtro ruolo
   */
  queryByRoleContext: [
    body('role_id')
      .optional()
      .isUUID().withMessage('L\'ID del ruolo deve essere un UUID valido'),
    
    body('include_global')
      .optional()
      .isBoolean().withMessage('include_global deve essere un valore booleano')
  ]
};

module.exports = userAbilityValidators;