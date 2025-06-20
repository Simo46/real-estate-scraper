'use strict';

const { body, param } = require('express-validator');

/**
 * Validazioni per le rotte di gestione utenti
 */
const userValidators = {
  /**
   * Validazioni per la creazione di un utente
   */
  createUser: [
    body('name')
      .notEmpty().withMessage('Il nome è obbligatorio')
      .isLength({ min: 1, max: 255 }).withMessage('Il nome deve essere compreso tra 1 e 255 caratteri')
      .trim()
      .escape(), 
    body('email')
      .notEmpty().withMessage('L\'email è obbligatoria')
      .isEmail().withMessage('L\'email non è valida')
      .isLength({ max: 255 }).withMessage('L\'email non può superare 255 caratteri') 
      .normalizeEmail()
      .toLowerCase(), 
    
    body('username')
      .notEmpty().withMessage('Il nome utente è obbligatorio')
      .isLength({ min: 3, max: 50 }).withMessage('Il nome utente deve essere compreso tra 3 e 50 caratteri')
      .matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Il nome utente può contenere solo lettere, numeri, punti, trattini e underscore')
      .toLowerCase(), 
    
    body('password')
      .notEmpty().withMessage('La password è obbligatoria')
      .isLength({ min: 8, max: 128 }).withMessage('La password deve essere compresa tra 8 e 128 caratteri') 
      .matches(/[a-z]/).withMessage('La password deve contenere almeno una lettera minuscola')
      .matches(/[A-Z]/).withMessage('La password deve contenere almeno una lettera maiuscola')
      .matches(/[0-9]/).withMessage('La password deve contenere almeno un numero'),

    body('tenant_id')
      .optional()
      .isUUID(4).withMessage('Il tenant_id deve essere un UUID valido'),

    body('settings')
      .optional()
      .isObject().withMessage('Le impostazioni devono essere un oggetto JSON'),

    body('email_verified_at')
      .optional()
      .isISO8601().withMessage('La data di verifica email deve essere in formato ISO8601'),
    
    body('roles')
      .optional()
      .isArray().withMessage('I ruoli devono essere un array'),
    
    body('roles.*')
      .optional()
      .isUUID(4).withMessage('Ogni ruolo deve essere un UUID valido'),
    
    body('abilities')
      .optional()
      .isArray({ max: 50 }).withMessage('Le abilità devono essere un array (massimo 50 elementi)'),
      
    body('abilities.*.action')
      .optional()
      .isLength({ min: 1 }).withMessage("L'azione deve essere specificata"),
      
    body('abilities.*.subject')
      .optional()
      .isLength({ min: 1, max: 100 }).withMessage('Il soggetto deve essere specificato'),
    
    body('active')
      .optional()
      .isBoolean().withMessage('Lo stato attivo deve essere un booleano')
  ],

  /**
   * Validazioni per l'aggiornamento di un utente
   */
  updateUser: [
    param('id')
      .isUUID(4).withMessage('L\'ID utente deve essere un UUID valido'),
      
    body('name')
      .optional()
      .isLength({ min: 1, max: 255 }).withMessage('Il nome deve essere compreso tra 1 e 255 caratteri')
      .trim()
      .escape(),
    
    body('email')
      .optional()
      .isEmail().withMessage('L\'email non è valida')
      .isLength({ max: 255 }).withMessage('L\'email non può superare 255 caratteri')
      .normalizeEmail()
      .toLowerCase(),
    
    body('username')
      .optional()
      .isLength({ min: 3, max: 50 }).withMessage('Il nome utente deve essere compreso tra 3 e 50 caratteri')
      .matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Il nome utente può contenere solo lettere, numeri, punti, trattini e underscore')
      .toLowerCase(),
    
    body('password')
      .optional()
      .isLength({ min: 8, max: 128 }).withMessage('La password deve essere compresa tra 8 e 128 caratteri')
      .matches(/[a-z]/).withMessage('La password deve contenere almeno una lettera minuscola')
      .matches(/[A-Z]/).withMessage('La password deve contenere almeno una lettera maiuscola')
      .matches(/[0-9]/).withMessage('La password deve contenere almeno un numero'),
    
    body('tenant_id')
      .optional()
      .isUUID(4).withMessage('Il tenant_id deve essere un UUID valido'),
      
    body('settings')
      .optional()
      .isObject().withMessage('Le impostazioni devono essere un oggetto JSON'),
      
    body('email_verified_at')
      .optional()
      .isISO8601().withMessage('La data di verifica email deve essere in formato ISO8601'),
    
    body('roles')
      .optional()
      .isArray().withMessage('I ruoli devono essere un array'),
    
    body('roles.*')
      .optional()
      .isUUID(4).withMessage('Ogni ruolo deve essere un UUID valido'),
    
    body('abilities')
      .optional()
      .isArray().withMessage('Le abilità devono essere un array'),

    body('abilities.*.action')
    .optional()
    .isLength({ min: 1 }).withMessage("L'azione deve essere specificata"),
      
    body('abilities.*.subject')
      .optional()
      .isLength({ min: 1, max: 100 }).withMessage('Il soggetto deve essere specificato'),
    
    body('active')
      .optional()
      .isBoolean().withMessage('Lo stato attivo deve essere un booleano')
  ],

  /**
   * Validazioni per l'assegnazione di ruoli
   */
  assignRoles: [
    param('id')
      .isUUID(4).withMessage('L\'ID utente deve essere un UUID valido'),
      
    body('roles')
      .isArray().withMessage('I ruoli devono essere un array')
      .notEmpty().withMessage('Almeno un ruolo deve essere specificato'),
    
    body('roles.*')
      .isUUID(4).withMessage('Ogni ruolo deve essere un UUID valido') 
  ],

  assignUserAbilities: [
    body('id')
      .isUUID(4).withMessage('L\'ID utente deve essere un UUID valido'),
      
    body('abilities')
      .isArray().withMessage('Le abilità devono essere un array'),
      
    body('abilities.*.action')
      .isLength({ min: 1 }).withMessage('Azione non valida'),
      
    body('abilities.*.subject')
      .isLength({ min: 1, max: 100 }).withMessage('Il soggetto deve essere specificato'),
      
    body('abilities.*.conditions')
      .optional()
      .isObject().withMessage('Le condizioni devono essere un oggetto JSON'),
      
    body('abilities.*.expires_at')
      .optional()
      .isISO8601().withMessage('La data di scadenza deve essere in formato ISO8601')
      .custom((value) => {
        if (new Date(value) <= new Date()) {
          throw new Error('La data di scadenza deve essere futura');
        }
        return true;
      }),
      
    body('abilities.*.reason')
      .optional()
      .isLength({ max: 255 }).withMessage('La motivazione non può superare 255 caratteri')
  ],

  searchUsers: [
    body('filters.tenant_id')
      .optional()
      .isUUID(4).withMessage('Il tenant_id deve essere un UUID valido'),
      
    body('filters.active')
      .optional()
      .isBoolean().withMessage('Il filtro attivo deve essere un booleano')
      .toBoolean(),
      
    body('filters.roles')
      .optional()
      .isArray().withMessage('I ruoli devono essere un array'),
      
    body('filters.roles.*')
      .optional()
      .isUUID(4).withMessage('Ogni ruolo deve essere un UUID valido'),
      
    body('pagination.page')
      .optional()
      .isInt({ min: 1 }).withMessage('La pagina deve essere un numero intero positivo')
      .toInt(),
      
    body('pagination.limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Il limite deve essere tra 1 e 100')
      .toInt()
  ]
};

module.exports = userValidators;