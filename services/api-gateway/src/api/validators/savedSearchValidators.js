'use strict';

const { body, param, query } = require('express-validator');
const { SavedSearch } = require('../../models');


/**
 * Validators per SavedSearch endpoints
 * Gestisce criteri di ricerca e configurazione esecuzioni
 */

/**
 * Validator per creazione SavedSearch
 */
const createSavedSearch = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('name must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_àáèéìíòóùúÀÁÈÉÌÍÒÓÙÚ]+$/)
    .withMessage('name contains invalid characters')
    .custom(async (value, { req }) => {
      // Verifica unicità nome per utente nel tenant
      const existingSearch = await SavedSearch.findOne({
        where: {
          name: value,
          user_id: req.user.id,
          tenant_id: req.tenantId
        }
      });
      
      if (existingSearch) {
        throw new Error('A saved search with this name already exists');
      }
      
      return true;
    }),

  body('natural_language_query')
    .optional()
    .trim()
    .isLength({ min: 5, max: 1000 })
    .withMessage('natural_language_query must be between 5 and 1000 characters')
    .custom((value) => {
      if (value) {
        // Verifica che contenga almeno alcuni termini di ricerca immobiliare
        const realEstateTerms = [
          'appartamento', 'casa', 'villa', 'attico', 'monolocale', 'bilocale', 'trilocale',
          'quadrilocale', 'loft', 'mansarda', 'ufficio', 'negozio', 'locale', 'terreno',
          'box', 'garage', 'posto auto', 'cantina', 'soffitta',
          'vendita', 'affitto', 'locazione', 'euro', '€', 'prezzo', 'budget',
          'milano', 'roma', 'napoli', 'torino', 'firenze', 'bologna', 'venezia',
          'centro', 'zona', 'quartiere', 'metri', 'mq', 'camere', 'bagni',
          'terrazzo', 'balcone', 'giardino', 'parcheggio', 'ascensore'
        ];
        
        const queryLower = value.toLowerCase();
        const hasRealEstateTerms = realEstateTerms.some(term => 
          queryLower.includes(term)
        );
        
        if (!hasRealEstateTerms) {
          throw new Error('Query should contain real estate related terms');
        }
      }
      
      return true;
    }),

  body('structured_criteria')
    .optional()
    .isObject()
    .withMessage('structured_criteria must be a valid JSON object')
    .custom((value) => {
      if (value) {
        // Validazione struttura dei criteri strutturati
        const allowedCriteria = {
          // Caratteristiche immobile
          property_type: ['apartment', 'house', 'villa', 'loft', 'office', 'commercial', 'land', 'garage'],
          price_min: 'number',
          price_max: 'number',
          sqm_min: 'number',
          sqm_max: 'number',
          rooms_min: 'number',
          rooms_max: 'number',
          bathrooms_min: 'number',
          bathrooms_max: 'number',
          
          // Ubicazione
          regions: 'array',
          provinces: 'array', 
          cities: 'array',
          areas: 'array',
          
          // Features
          features: 'array', // ['terrace', 'garden', 'parking', 'elevator', 'furnished']
          energy_class: 'array', // ['A', 'B', 'C', 'D', 'E', 'F', 'G']
          floor_min: 'number',
          floor_max: 'number',
          
          // Tipo contratto
          contract_type: ['sale', 'rent', 'both'],
          
          // Filtri aggiuntivi
          exclude_agencies: 'array',
          only_verified: 'boolean',
          with_photos_only: 'boolean',
          max_listing_age_days: 'number'
        };
        
        // Verifica che tutte le chiavi siano valide
        const providedKeys = Object.keys(value);
        const invalidKeys = providedKeys.filter(key => !(key in allowedCriteria));
        
        if (invalidKeys.length > 0) {
          throw new Error(`Invalid criteria keys: ${invalidKeys.join(', ')}`);
        }
        
        // Validazione tipi per chiavi fornite
        for (const [key, critValue] of Object.entries(value)) {
          const expectedType = allowedCriteria[key];
          
          if (Array.isArray(expectedType)) {
            // Enum validation
            if (!expectedType.includes(critValue)) {
              throw new Error(`${key} must be one of: ${expectedType.join(', ')}`);
            }
          } else if (expectedType === 'number') {
            if (typeof critValue !== 'number' || critValue < 0) {
              throw new Error(`${key} must be a positive number`);
            }
          } else if (expectedType === 'array') {
            if (!Array.isArray(critValue)) {
              throw new Error(`${key} must be an array`);
            }
          } else if (expectedType === 'boolean') {
            if (typeof critValue !== 'boolean') {
              throw new Error(`${key} must be a boolean`);
            }
          }
        }
        
        // Validazioni logiche
        if (value.price_min && value.price_max && value.price_min >= value.price_max) {
          throw new Error('price_min must be less than price_max');
        }
        
        if (value.sqm_min && value.sqm_max && value.sqm_min >= value.sqm_max) {
          throw new Error('sqm_min must be less than sqm_max');
        }
        
        if (value.rooms_min && value.rooms_max && value.rooms_min >= value.rooms_max) {
          throw new Error('rooms_min must be less than rooms_max');
        }
      }
      
      return true;
    }),

  body('execution_frequency')
    .optional()
    .isIn(['manual', 'hourly', 'daily', 'weekly', 'monthly'])
    .withMessage('execution_frequency must be manual, hourly, daily, weekly, or monthly'),

  body('notify_on_new_results')
    .optional()
    .isBoolean()
    .withMessage('notify_on_new_results must be a boolean')
    .toBoolean(),

  // Almeno uno tra natural_language_query e structured_criteria deve essere presente
  body()
    .custom((value) => {
      if (!value.natural_language_query && !value.structured_criteria) {
        throw new Error('Either natural_language_query or structured_criteria must be provided');
      }
      
      return true;
    }),

  
];

/**
 * Validator per aggiornamento SavedSearch
 */
const updateSavedSearch = [
  param('id')
    .isUUID(4)
    .withMessage('Saved search ID must be a valid UUID'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('name must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_àáèéìíòóùúÀÁÈÉÌÍÒÓÙÚ]+$/)
    .withMessage('name contains invalid characters')
    .custom(async (value, { req }) => {
      if (value) {
        // Verifica unicità nome per utente nel tenant (escludendo current record)
        const existingSearch = await SavedSearch.findOne({
          where: {
            name: value,
            user_id: req.user.id,
            tenant_id: req.tenantId,
            id: { [require('sequelize').Op.ne]: req.params.id }
          }
        });
        
        if (existingSearch) {
          throw new Error('A saved search with this name already exists');
        }
      }
      
      return true;
    }),

  body('natural_language_query')
    .optional()
    .trim()
    .isLength({ min: 5, max: 1000 })
    .withMessage('natural_language_query must be between 5 and 1000 characters'),

  body('structured_criteria')
    .optional()
    .isObject()
    .withMessage('structured_criteria must be a valid JSON object'),

  body('execution_frequency')
    .optional()
    .isIn(['manual', 'hourly', 'daily', 'weekly', 'monthly'])
    .withMessage('execution_frequency must be manual, hourly, daily, weekly, or monthly'),

  body('notify_on_new_results')
    .optional()
    .isBoolean()
    .withMessage('notify_on_new_results must be a boolean')
    .toBoolean(),

  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean')
    .toBoolean(),

  
];

/**
 * Validator per esecuzione SavedSearch
 */
const executeSavedSearch = [
  param('id')
    .isUUID(4)
    .withMessage('Saved search ID must be a valid UUID'),

  body('execution_type')
    .optional()
    .isIn(['manual', 'scheduled', 'retry'])
    .withMessage('execution_type must be manual, scheduled, or retry'),

  
];

/**
 * Validator per duplicazione SavedSearch
 */
const duplicateSavedSearch = [
  param('id')
    .isUUID(4)
    .withMessage('Saved search ID must be a valid UUID'),

  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('name must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_àáèéìíòóùúÀÁÈÉÌÍÒÓÙÚ]+$/)
    .withMessage('name contains invalid characters')
    .custom(async (value, { req }) => {
      if (value) {
        // Verifica unicità nome per utente nel tenant
        const existingSearch = await SavedSearch.findOne({
          where: {
            name: value,
            user_id: req.user.id,
            tenant_id: req.tenantId
          }
        });
        
        if (existingSearch) {
          throw new Error('A saved search with this name already exists');
        }
      }
      
      return true;
    }),

  
];

/**
 * Validator per query parameters nelle liste
 */
const validateSavedSearchQuery = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('page must be between 1 and 1000')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be between 1 and 50')
    .toInt(),

  query('sort_by')
    .optional()
    .isIn(['name', 'created_at', 'updated_at', 'last_executed_at'])
    .withMessage('sort_by must be name, created_at, updated_at, or last_executed_at'),

  query('sort_dir')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('sort_dir must be ASC or DESC')
    .toUpperCase(),

  query('is_active')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('is_active must be true or false'),

  query('execution_frequency')
    .optional()
    .isIn(['manual', 'hourly', 'daily', 'weekly', 'monthly'])
    .withMessage('execution_frequency must be manual, hourly, daily, weekly, or monthly'),

  query('search')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('search must be between 2 and 200 characters'),

  
];

/**
 * Validator per execution history query
 */
const validateExecutionHistoryQuery = [
  param('id')
    .isUUID(4)
    .withMessage('Saved search ID must be a valid UUID'),

  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('page must be between 1 and 1000')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be between 1 and 50')
    .toInt(),

  
];

/**
 * Validator per ID nei path parameters
 */
const validateSavedSearchId = [
  param('id')
    .isUUID(4)
    .withMessage('Saved search ID must be a valid UUID'),

  
];

/**
 * Validator per search stats query
 */
const validateSearchStatsQuery = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('days must be between 1 and 365')
    .toInt(),

  
];

/**
 * Validator per batch operations sulle saved searches
 */
const validateBatchOperation = [
  body('saved_search_ids')
    .isArray({ min: 1, max: 50 })
    .withMessage('saved_search_ids must be an array with 1-50 items'),

  body('saved_search_ids.*')
    .isUUID(4)
    .withMessage('Each saved_search_id must be a valid UUID'),

  body('operation')
    .isIn(['activate', 'deactivate', 'delete', 'set_frequency'])
    .withMessage('operation must be activate, deactivate, delete, or set_frequency'),

  body('frequency')
    .if(body('operation').equals('set_frequency'))
    .isIn(['manual', 'hourly', 'daily', 'weekly', 'monthly'])
    .withMessage('frequency must be provided when operation is set_frequency'),

  
];

/**
 * Validator per import/export di saved searches
 */
const validateImportSavedSearches = [
  body('saved_searches')
    .isArray({ min: 1, max: 100 })
    .withMessage('saved_searches must be an array with 1-100 items'),

  body('saved_searches.*.name')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Each saved search name must be between 3 and 100 characters'),

  body('saved_searches.*.natural_language_query')
    .optional()
    .trim()
    .isLength({ min: 5, max: 1000 })
    .withMessage('natural_language_query must be between 5 and 1000 characters'),

  body('saved_searches.*.structured_criteria')
    .optional()
    .isObject()
    .withMessage('structured_criteria must be a valid JSON object'),

  body('overwrite_existing')
    .optional()
    .isBoolean()
    .withMessage('overwrite_existing must be a boolean')
    .toBoolean(),

  
];

module.exports = {
  createSavedSearch,
  updateSavedSearch,
  executeSavedSearch,
  duplicateSavedSearch,
  validateSavedSearchQuery,
  validateExecutionHistoryQuery,
  validateSavedSearchId,
  validateSearchStatsQuery,
  validateBatchOperation,
  validateImportSavedSearches
};