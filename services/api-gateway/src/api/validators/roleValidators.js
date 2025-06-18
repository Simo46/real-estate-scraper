'use strict';

const { body } = require('express-validator');

/**
 * Validazioni per le rotte di gestione ruoli
 */
const roleValidators = {
  /**
   * Validazioni per la creazione di un ruolo
   */
  createRole: [
    body('name')
      .notEmpty().withMessage('Il nome è obbligatorio')
      .isLength({ min: 2, max: 50 }).withMessage('Il nome deve essere compreso tra 2 e 50 caratteri')
      .matches(/^[a-zA-Z0-9\s]+$/).withMessage('Il nome può contenere solo lettere, numeri e spazi'),
    
    body('description')
      .optional()
      .isLength({ max: 255 }).withMessage('La descrizione non può superare 255 caratteri')
  ],

  /**
   * Validazioni per l'aggiornamento di un ruolo
   */
  updateRole: [
    body('name')
      .optional()
      .isLength({ min: 2, max: 50 }).withMessage('Il nome deve essere compreso tra 2 e 50 caratteri')
      .matches(/^[a-zA-Z0-9\s]+$/).withMessage('Il nome può contenere solo lettere, numeri e spazi'),
    
    body('description')
      .optional()
      .isLength({ max: 255 }).withMessage('La descrizione non può superare 255 caratteri')
  ],

  /**
   * Validazioni per l'assegnazione di abilities a un ruolo
   */
  assignAbilities: [
    body('abilities')
      .isArray().withMessage('Le abilities devono essere un array')
      .notEmpty().withMessage('Almeno una ability deve essere specificata'),
    
    body('abilities.*.action')
      .notEmpty().withMessage('L\'azione è obbligatoria')
      .isIn(['create', 'read', 'update', 'delete', 'manage']).withMessage('L\'azione deve essere una di: create, read, update, delete, manage'),
    
    body('abilities.*.subject')
      .notEmpty().withMessage('Il soggetto è obbligatorio'),
    
    body('abilities.*.conditions')
      .optional()
      .isObject().withMessage('Le condizioni devono essere un oggetto JSON'),
    
    body('abilities.*.fields')
      .optional()
      .isArray().withMessage('I campi devono essere un array'),
    
    body('abilities.*.inverted')
      .optional()
      .isBoolean().withMessage('Il flag invertito deve essere un booleano')
  ]
};

module.exports = roleValidators;