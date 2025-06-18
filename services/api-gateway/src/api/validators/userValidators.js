'use strict';

const { body } = require('express-validator');

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
      .isLength({ min: 2, max: 100 }).withMessage('Il nome deve essere compreso tra 2 e 100 caratteri'),
    
    body('email')
      .notEmpty().withMessage('L\'email è obbligatoria')
      .isEmail().withMessage('L\'email non è valida')
      .normalizeEmail(),
    
    body('username')
      .notEmpty().withMessage('Il nome utente è obbligatorio')
      .isLength({ min: 3, max: 50 }).withMessage('Il nome utente deve essere compreso tra 3 e 50 caratteri')
      .matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Il nome utente può contenere solo lettere, numeri, punti, trattini e underscore'),
    
    body('password')
      .notEmpty().withMessage('La password è obbligatoria')
      .isLength({ min: 8 }).withMessage('La password deve essere di almeno 8 caratteri')
      .matches(/[a-z]/).withMessage('La password deve contenere almeno una lettera minuscola')
      .matches(/[A-Z]/).withMessage('La password deve contenere almeno una lettera maiuscola')
      .matches(/[0-9]/).withMessage('La password deve contenere almeno un numero'),
    
    body('filiale_id')
      .optional()
      .isUUID().withMessage('L\'ID della filiale non è valido'),
    
    body('roles')
      .optional()
      .isArray().withMessage('I ruoli devono essere un array'),
    
    body('roles.*')
      .optional()
      .isString().withMessage('Ogni ruolo deve essere una stringa'),
    
    body('abilities')
      .optional()
      .isArray().withMessage('Le abilità devono essere un array'),
    
    body('active')
      .optional()
      .isBoolean().withMessage('Lo stato attivo deve essere un booleano'),
    
    body('phone')
      .optional()
      .isString().withMessage('Il telefono deve essere una stringa'),
    
    body('job_title')
      .optional()
      .isString().withMessage('La posizione lavorativa deve essere una stringa'),
    
    body('avatar')
      .optional()
      .isString().withMessage('L\'avatar deve essere una stringa')
  ],

  /**
   * Validazioni per l'aggiornamento di un utente
   */
  updateUser: [
    body('name')
      .optional()
      .isLength({ min: 2, max: 100 }).withMessage('Il nome deve essere compreso tra 2 e 100 caratteri'),
    
    body('email')
      .optional()
      .isEmail().withMessage('L\'email non è valida')
      .normalizeEmail(),
    
    body('username')
      .optional()
      .isLength({ min: 3, max: 50 }).withMessage('Il nome utente deve essere compreso tra 3 e 50 caratteri')
      .matches(/^[a-zA-Z0-9_.-]+$/).withMessage('Il nome utente può contenere solo lettere, numeri, punti, trattini e underscore'),
    
    body('password')
      .optional()
      .isLength({ min: 8 }).withMessage('La password deve essere di almeno 8 caratteri')
      .matches(/[a-z]/).withMessage('La password deve contenere almeno una lettera minuscola')
      .matches(/[A-Z]/).withMessage('La password deve contenere almeno una lettera maiuscola')
      .matches(/[0-9]/).withMessage('La password deve contenere almeno un numero'),
    
    body('filiale_id')
      .optional()
      .isUUID().withMessage('L\'ID della filiale non è valido'),
    
    body('roles')
      .optional()
      .isArray().withMessage('I ruoli devono essere un array'),
    
    body('roles.*')
      .optional()
      .isString().withMessage('Ogni ruolo deve essere una stringa'),
    
    body('abilities')
      .optional()
      .isArray().withMessage('Le abilità devono essere un array'),
    
    body('active')
      .optional()
      .isBoolean().withMessage('Lo stato attivo deve essere un booleano'),
    
    body('phone')
      .optional()
      .isString().withMessage('Il telefono deve essere una stringa'),
    
    body('job_title')
      .optional()
      .isString().withMessage('La posizione lavorativa deve essere una stringa'),
    
    body('avatar')
      .optional()
      .isString().withMessage('L\'avatar deve essere una stringa')
  ],

  /**
   * Validazioni per l'assegnazione di ruoli
   */
  assignRoles: [
    body('roles')
      .isArray().withMessage('I ruoli devono essere un array')
      .notEmpty().withMessage('Almeno un ruolo deve essere specificato'),
    
    body('roles.*')
      .isString().withMessage('Ogni ruolo deve essere una stringa')
  ]
};

module.exports = userValidators;