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
      .isLength({ min: 2, max: 255 }).withMessage('Il nome deve essere compreso tra 2 e 255 caratteri') 
      .matches(/^[a-zA-Z0-9\s_-]+$/).withMessage('Il nome può contenere solo lettere, numeri, spazi, underscore e trattini') 
      .trim(), 
    
    body('description')
      .optional()
      .isLength({ max: 255 }).withMessage('La descrizione non può superare 255 caratteri')
      .trim() 
  ],

  /**
   * Validazioni per l'aggiornamento di un ruolo
   */
  updateRole: [
    body('name')
      .optional()
      .isLength({ min: 2, max: 255 }).withMessage('Il nome deve essere compreso tra 2 e 255 caratteri') 
      .matches(/^[a-zA-Z0-9\s_-]+$/).withMessage('Il nome può contenere solo lettere, numeri, spazi, underscore e trattini')
      .trim(),
    
    body('description')
      .optional()
      .isLength({ max: 255 }).withMessage('La descrizione non può superare 255 caratteri')
      .trim()
  ],

  /**
   * Validazioni per l'assegnazione di abilities a un ruolo
   */
  assignAbilities: [
    body('abilities')
      .isArray({ min: 1 }).withMessage('Le abilities devono essere un array con almeno 1 elemento '), 
    
    body('abilities.*.action')
      .notEmpty().withMessage('L\'azione è obbligatoria')
      .isLength({ min: 1 }).withMessage('L\'azione deve essere presente'),
    
    body('abilities.*.subject')
      .notEmpty().withMessage('Il soggetto è obbligatorio')
      .isLength({ min: 1, max: 100 }).withMessage('Il soggetto deve essere compreso tra 1 e 100 caratteri'), 
    
    body('abilities.*.conditions')
      .optional()
      .isObject().withMessage('Le condizioni devono essere un oggetto JSON'),
    
    body('abilities.*.fields')
      .optional()
      .isArray().withMessage('I campi devono essere un array '), 
      
    body('abilities.*.fields.*')
      .optional()
      .isString().withMessage('Ogni campo deve essere una stringa'),
    
    body('abilities.*.inverted')
      .optional()
      .isBoolean().withMessage('Il flag invertito deve essere un booleano')
      .toBoolean() 
  ]
};

module.exports = roleValidators;