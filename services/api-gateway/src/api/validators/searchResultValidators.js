'use strict';

const { body, param, query } = require('express-validator');
const { SearchExecution } = require('../../models');


/**
 * Validators per SearchResult endpoints
 * Valida solo metadata + AI analysis (NO contenuti originali per compliance)
 */

/**
 * Validator per creazione SearchResult
 * Solo per sistema interno (scraping service)
 */
const createSearchResult = [
  body('execution_id')
    .isUUID(4)
    .withMessage('execution_id must be a valid UUID')
    .custom(async (value, { req }) => {
      // Verifica che l'execution esista e appartenga al tenant
      const execution = await SearchExecution.findOne({
        where: {
          id: value,
          tenant_id: req.tenantId
        }
      });
      
      if (!execution) {
        throw new Error('Search execution not found');
      }
      
      // Verifica che l'execution sia in corso
      if (!['pending', 'running'].includes(execution.status)) {
        throw new Error('Cannot add results to completed/failed execution');
      }
      
      return true;
    }),

  body('external_url')
    .isURL({
      protocols: ['http', 'https'],
      require_protocol: true
    })
    .withMessage('external_url must be a valid HTTP/HTTPS URL')
    .isLength({ max: 2000 })
    .withMessage('external_url must not exceed 2000 characters')
    .custom((value) => {
      // Verifica che l'URL sia di un portale immobiliare italiano supportato
      const allowedDomains = [
        'immobiliare.it',
        'casa.it',
        'subito.it',
        'idealista.it',
        'tecnocasa.it',
        'remax.it'
      ];
      
      try {
        const url = new URL(value);
        const isAllowed = allowedDomains.some(domain => 
          url.hostname.includes(domain)
        );
        
        if (!isAllowed) {
          throw new Error('URL must be from a supported real estate platform');
        }
        
        return true;
      } catch (error) {
        throw new Error('Invalid URL format');
      }
    }),

  body('source_platform')
    .isIn(['immobiliare.it', 'casa.it', 'subito.it', 'idealista.it', 'tecnocasa.it', 'remax.it'])
    .withMessage('source_platform must be a supported platform'),

  body('basic_title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('basic_title must be between 5 and 200 characters')
    .matches(/^[a-zA-Z0-9\s\-\+\(\)\[\]\.,àáèéìíòóùúÀÁÈÉÌÍÒÓÙÚ]+$/)
    .withMessage('basic_title contains invalid characters'),

  body('basic_price')
    .isFloat({ min: 0, max: 50000000 })
    .withMessage('basic_price must be a positive number up to 50M')
    .toFloat(),

  body('basic_location')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('basic_location must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s\-\(\)àáèéìíòóùúÀÁÈÉÌÍÒÓÙÚ]+$/)
    .withMessage('basic_location contains invalid characters'),

  body('relevance_score')
    .isFloat({ min: 0, max: 1 })
    .withMessage('relevance_score must be between 0 and 1')
    .toFloat(),

  body('ai_insights')
    .optional()
    .isObject()
    .withMessage('ai_insights must be a valid JSON object')
    .custom((value) => {
      // Validazione struttura ai_insights
      if (value) {
        const allowedKeys = [
          'property_type', 'condition_assessment', 'value_analysis',
          'location_score', 'features_extracted', 'market_position',
          'investment_potential', 'quality_indicators'
        ];
        
        const providedKeys = Object.keys(value);
        const invalidKeys = providedKeys.filter(key => !allowedKeys.includes(key));
        
        if (invalidKeys.length > 0) {
          throw new Error(`Invalid ai_insights keys: ${invalidKeys.join(', ')}`);
        }
      }
      return true;
    }),

  body('ai_summary')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('ai_summary must not exceed 1000 characters'),

  body('ai_recommendation')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('ai_recommendation must not exceed 500 characters'),

  
];

/**
 * Validator per aggiornamento AI analysis
 */
const updateAIAnalysis = [
  param('id')
    .isUUID(4)
    .withMessage('Search result ID must be a valid UUID'),

  body('ai_insights')
    .optional()
    .isObject()
    .withMessage('ai_insights must be a valid JSON object'),

  body('ai_summary')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('ai_summary must not exceed 1000 characters'),

  body('ai_recommendation')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('ai_recommendation must not exceed 500 characters'),

  body('relevance_score')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('relevance_score must be between 0 and 1')
    .toFloat(),

  // Almeno un campo deve essere presente
  body()
    .custom((value) => {
      const allowedFields = ['ai_insights', 'ai_summary', 'ai_recommendation', 'relevance_score'];
      const providedFields = Object.keys(value).filter(key => allowedFields.includes(key));
      
      if (providedFields.length === 0) {
        throw new Error('At least one field must be provided for update');
      }
      
      return true;
    }),

  
];

/**
 * Validator per query parameters nelle liste
 */
const validateSearchResultQuery = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('page must be between 1 and 1000')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100')
    .toInt(),

  query('sort_by')
    .optional()
    .isIn(['relevance_score', 'basic_price', 'created_at', 'basic_location'])
    .withMessage('sort_by must be relevance_score, basic_price, created_at, or basic_location'),

  query('sort_dir')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('sort_dir must be ASC or DESC')
    .toUpperCase(),

  query('source_platform')
    .optional()
    .isIn(['immobiliare.it', 'casa.it', 'subito.it', 'idealista.it', 'tecnocasa.it', 'remax.it'])
    .withMessage('source_platform must be a supported platform'),

  query('min_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('min_price must be a positive number')
    .toFloat(),

  query('max_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('max_price must be a positive number')
    .toFloat(),

  query('basic_location')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('basic_location must be between 2 and 100 characters'),

  query('min_relevance_score')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('min_relevance_score must be between 0 and 1')
    .toFloat(),

  query('execution_id')
    .optional()
    .isUUID(4)
    .withMessage('execution_id must be a valid UUID'),

  query('search')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('search must be between 2 and 200 characters'),

  // Validazione logica sui prezzi
  query()
    .custom((value) => {
      if (value.min_price && value.max_price) {
        const minPrice = parseFloat(value.min_price);
        const maxPrice = parseFloat(value.max_price);
        
        if (minPrice >= maxPrice) {
          throw new Error('min_price must be less than max_price');
        }
      }
      
      return true;
    }),

  
];

/**
 * Validator per ID nei path parameters
 */
const validateSearchResultId = [
  param('id')
    .isUUID(4)
    .withMessage('Search result ID must be a valid UUID'),

  
];

/**
 * Validator per execution ID nei path parameters
 */
const validateExecutionId = [
  param('executionId')
    .isUUID(4)
    .withMessage('Execution ID must be a valid UUID'),

  
];

/**
 * Validator per mark as viewed
 */
const markAsViewed = [
  param('id')
    .isUUID(4)
    .withMessage('Search result ID must be a valid UUID'),

  
];

/**
 * Validator per top results query
 */
const validateTopResultsQuery = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be between 1 and 50')
    .toInt(),

  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('days must be between 1 and 365')
    .toInt(),

  
];

/**
 * Validator specifico per batch operations (future use)
 */
const validateBatchUpdate = [
  body('search_result_ids')
    .isArray({ min: 1, max: 100 })
    .withMessage('search_result_ids must be an array with 1-100 items'),

  body('search_result_ids.*')
    .isUUID(4)
    .withMessage('Each search_result_id must be a valid UUID'),

  body('updates')
    .isObject()
    .withMessage('updates must be an object'),

  body('updates.relevance_score')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('relevance_score must be between 0 and 1')
    .toFloat(),

  
];

module.exports = {
  createSearchResult,
  updateAIAnalysis,
  validateSearchResultQuery,
  validateSearchResultId,
  validateExecutionId,
  markAsViewed,
  validateTopResultsQuery,
  validateBatchUpdate
};