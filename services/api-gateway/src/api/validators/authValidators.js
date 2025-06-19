'use strict';

const { body, query } = require('express-validator');

/**
 * Validazioni per le rotte di autenticazione con supporto multi-ruolo
 */
const authValidators = {
  /**
   * Validazioni per la registrazione
   */
  register: [
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
      .matches(/[0-9]/).withMessage('La password deve contenere almeno un numero')
  ],

  /**
   * Validazioni per il login standard (con supporto opzionale per roleId)
   */
  login: [
    body('username')
      .notEmpty().withMessage('Username o email è obbligatorio'),
    
    body('password')
      .notEmpty().withMessage('La password è obbligatoria'),
    
    // NUOVO: Supporto opzionale per roleId nel login standard
    body('roleId')
      .optional()
      .isUUID().withMessage('L\'ID del ruolo non è valido')
      .custom((value, { req }) => {
        // Se roleId è fornito, implicitamente si sta usando login-with-role
        // Ma lo gestiamo comunque nel controller standard per flessibilità
        return true;
      })
  ],

  /**
   * NUOVO: Validazioni per il login con ruolo specificato
   */
  loginWithRole: [
    body('username')
      .notEmpty().withMessage('Username o email è obbligatorio'),
    
    body('password')
      .notEmpty().withMessage('La password è obbligatoria'),
    
    body('roleId')
      .notEmpty().withMessage('L\'ID del ruolo è obbligatorio')
      .isUUID().withMessage('L\'ID del ruolo deve essere un UUID valido')
  ],

  /**
   * NUOVO: Validazioni per la conferma ruolo
   */
  confirmRole: [
    body('preAuthToken')
      .notEmpty().withMessage('Il token di pre-autenticazione è obbligatorio')
      .isJWT().withMessage('Il token di pre-autenticazione deve essere un JWT valido'),
    
    body('roleId')
      .notEmpty().withMessage('L\'ID del ruolo è obbligatorio')
      .isUUID().withMessage('L\'ID del ruolo deve essere un UUID valido')
  ],

  /**
   * NUOVO: Validazioni per il cambio ruolo
   */
  switchRole: [
    body('roleId')
      .notEmpty().withMessage('L\'ID del ruolo è obbligatorio')
      .isUUID().withMessage('L\'ID del ruolo deve essere un UUID valido')
  ],

  /**
   * Validazioni per il refresh token
   */
  refreshToken: [
    body('refreshToken')
      .notEmpty().withMessage('Il refresh token è obbligatorio')
      .isJWT().withMessage('Il refresh token deve essere un JWT valido')
  ],

  /**
   * NUOVO: Validazioni per l'aggiornamento delle impostazioni di autenticazione
   */
  updateAuthSettings: [
    body('default_role_id')
      .optional()
      .isUUID().withMessage('L\'ID del ruolo predefinito deve essere un UUID valido'),
    
    body('auto_login_with_default')
      .optional()
      .isBoolean().withMessage('auto_login_with_default deve essere un valore booleano'),
    
    body('last_used_roles')
      .optional()
      .isArray({ max: 5 }).withMessage('last_used_roles deve essere un array di massimo 5 elementi')
      .custom((value) => {
        // Verifica che tutti gli elementi siano UUID validi
        if (value && Array.isArray(value)) {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          const allValidUUIDs = value.every(id => uuidRegex.test(id));
          if (!allValidUUIDs) {
            throw new Error('Tutti gli elementi di last_used_roles devono essere UUID validi');
          }
        }
        return true;
      })
  ],

  /**
   * NUOVO: Validazioni per parametri di query comuni
   */
  queryParams: {
    roleId: [
      body('roleId')
        .optional()
        .isUUID().withMessage('L\'ID del ruolo deve essere un UUID valido')
    ],
    
    includeRoles: [
      body('include_roles')
        .optional()
        .isBoolean().withMessage('include_roles deve essere un valore booleano')
    ]
  },

  /**
   * NUOVO: Middleware di validazione rate limiting
   */
  rateLimitValidation: {
    // Validazioni specifiche per endpoint con rate limiting
    preAuthToken: [
      body('preAuthToken')
        .custom(async (value, { req }) => {
          // Verifica base del formato token
          if (!value || typeof value !== 'string') {
            throw new Error('Token di pre-autenticazione richiesto');
          }
          
          // Qui potremo aggiungere validazioni aggiuntive come:
          // - Verifica blacklist Redis
          // - Rate limiting per token specifico
          // - Controllo riutilizzo token
          
          return true;
        })
    ],

    /**
     * NUOVO: Validazioni per query parameters comuni
     */
    commonQuery: [
      query('include_roles')
        .optional()
        .isBoolean().withMessage('include_roles deve essere un valore booleano'),
      
      query('include_abilities')
        .optional()
        .isBoolean().withMessage('include_abilities deve essere un valore booleano')
    ],

    /**
     * NUOVO: Validazioni per debugging e sviluppo
     */
    debugParams: [
      body('debug_mode')
        .optional()
        .isBoolean().withMessage('debug_mode deve essere un valore booleano'),
      
      body('force_role_selection')
        .optional()
        .isBoolean().withMessage('force_role_selection deve essere un valore booleano'),
      
      body('simulate_error')
        .optional()
        .isIn(['token_expired', 'invalid_role', 'rate_limit']).withMessage('simulate_error deve essere un errore valido')
    ]
  },

  resetRateLimit: [
    body('identifier')
      .notEmpty().withMessage('L\'identificatore è obbligatorio')
      .isLength({ min: 1, max: 100 }).withMessage('L\'identificatore deve essere compreso tra 1 e 100 caratteri'),
    
    body('type')
      .notEmpty().withMessage('Il tipo è obbligatorio')
      .isIn(['ip', 'user', 'token']).withMessage('Il tipo deve essere uno tra: ip, user, token'),
    
    body('reason')
      .optional()
      .isLength({ max: 255 }).withMessage('La motivazione non può superare 255 caratteri')
  ],
};

module.exports = authValidators;