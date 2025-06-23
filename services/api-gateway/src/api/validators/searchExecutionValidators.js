'use strict';

const { body, param, query } = require('express-validator');
const { SavedSearch, SearchExecution } = require('../../models');


/**
 * Validators per SearchExecution endpoints
 * Gestisce tracking e stato delle esecuzioni di ricerca
 */

/**
 * Validator per creazione SearchExecution
 */
const createSearchExecution = [
  body('saved_search_id')
    .isUUID(4)
    .withMessage('saved_search_id must be a valid UUID')
    .custom(async (value, { req }) => {
      // Verifica che la saved search esista, sia attiva e appartenga all'utente
      const savedSearch = await SavedSearch.findOne({
        where: {
          id: value,
          tenant_id: req.tenantId,
          user_id: req.user.id,
          is_active: true
        }
      });
      
      if (!savedSearch) {
        throw new Error('Active saved search not found or access denied');
      }
      
      // Verifica che non ci sia già un'esecuzione attiva per questa ricerca
      const activeExecution = await SearchExecution.findOne({
        where: {
          saved_search_id: value,
          status: ['pending', 'running'],
          tenant_id: req.tenantId
        }
      });
      
      if (activeExecution) {
        throw new Error('There is already an active execution for this saved search');
      }
      
      return true;
    }),

  body('execution_type')
    .optional()
    .isIn(['manual', 'scheduled', 'retry'])
    .withMessage('execution_type must be manual, scheduled, or retry'),

  body('platforms_searched')
    .optional()
    .isArray()
    .withMessage('platforms_searched must be an array')
    .custom((value) => {
      if (value && value.length > 0) {
        const allowedPlatforms = [
          'immobiliare.it', 'casa.it', 'subito.it', 'idealista.it', 
          'tecnocasa.it', 'remax.it'
        ];
        
        const invalidPlatforms = value.filter(platform => 
          !allowedPlatforms.includes(platform)
        );
        
        if (invalidPlatforms.length > 0) {
          throw new Error(`Invalid platforms: ${invalidPlatforms.join(', ')}`);
        }
      }
      
      return true;
    }),

  body('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('priority must be low, normal, high, or urgent'),

  
];

/**
 * Validator per aggiornamento status SearchExecution
 */
const updateExecutionStatus = [
  param('id')
    .isUUID(4)
    .withMessage('Search execution ID must be a valid UUID'),

  body('status')
    .optional()
    .isIn(['pending', 'running', 'completed', 'failed', 'cancelled'])
    .withMessage('status must be pending, running, completed, failed, or cancelled'),

  body('platforms_searched')
    .optional()
    .isArray()
    .withMessage('platforms_searched must be an array'),

  body('total_results_found')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('total_results_found must be between 0 and 10000')
    .toInt(),

  body('new_results_count')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('new_results_count must be between 0 and 10000')
    .toInt(),

  body('execution_errors')
    .optional()
    .isArray()
    .withMessage('execution_errors must be an array')
    .custom((value) => {
      if (value && value.length > 0) {
        // Valida struttura degli errori
        const validErrors = value.every(error => 
          typeof error === 'object' &&
          typeof error.message === 'string' &&
          typeof error.timestamp === 'string' &&
          (!error.platform || typeof error.platform === 'string') &&
          (!error.severity || ['warning', 'error', 'critical'].includes(error.severity))
        );
        
        if (!validErrors) {
          throw new Error('execution_errors must contain valid error objects with message and timestamp');
        }
      }
      
      return true;
    }),

  body('completed_at')
    .optional()
    .isISO8601()
    .withMessage('completed_at must be a valid ISO8601 date')
    .toDate(),

  // Validazione logica sullo stato
  body()
    .custom((value) => {
      // Se status è completed/failed/cancelled, deve avere completed_at
      if (['completed', 'failed', 'cancelled'].includes(value.status) && !value.completed_at) {
        // Se non fornito, verrà impostato automaticamente dal controller
      }
      
      // Se total_results_found e new_results_count sono forniti, validazione logica
      if (value.total_results_found !== undefined && value.new_results_count !== undefined) {
        if (value.new_results_count > value.total_results_found) {
          throw new Error('new_results_count cannot be greater than total_results_found');
        }
      }
      
      return true;
    }),

  
];

/**
 * Validator per query parameters nelle liste
 */
const validateSearchExecutionQuery = [
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
    .isIn(['started_at', 'completed_at', 'status', 'total_results_found', 'execution_type'])
    .withMessage('sort_by must be started_at, completed_at, status, total_results_found, or execution_type'),

  query('sort_dir')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('sort_dir must be ASC or DESC')
    .toUpperCase(),

  query('status')
    .optional()
    .isIn(['pending', 'running', 'completed', 'failed', 'cancelled'])
    .withMessage('status must be pending, running, completed, failed, or cancelled'),

  query('execution_type')
    .optional()
    .isIn(['manual', 'scheduled', 'retry'])
    .withMessage('execution_type must be manual, scheduled, or retry'),

  query('saved_search_id')
    .optional()
    .isUUID(4)
    .withMessage('saved_search_id must be a valid UUID'),

  query('date_from')
    .optional()
    .isISO8601()
    .withMessage('date_from must be a valid ISO8601 date')
    .toDate(),

  query('date_to')
    .optional()
    .isISO8601()
    .withMessage('date_to must be a valid ISO8601 date')
    .toDate(),

  // Validazione logica sulle date
  query()
    .custom((value) => {
      if (value.date_from && value.date_to) {
        const fromDate = new Date(value.date_from);
        const toDate = new Date(value.date_to);
        
        if (fromDate >= toDate) {
          throw new Error('date_from must be earlier than date_to');
        }
        
        // Limita il range massimo a 1 anno
        const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 anno in millisecondi
        if (toDate - fromDate > maxRange) {
          throw new Error('Date range cannot exceed 1 year');
        }
      }
      
      return true;
    }),

  
];

/**
 * Validator per ID nei path parameters
 */
const validateSearchExecutionId = [
  param('id')
    .isUUID(4)
    .withMessage('Search execution ID must be a valid UUID'),

  
];

/**
 * Validator per execution results query
 */
const validateExecutionResultsQuery = [
  param('id')
    .isUUID(4)
    .withMessage('Search execution ID must be a valid UUID'),

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
    .isIn(['relevance_score', 'basic_price', 'created_at', 'source_platform'])
    .withMessage('sort_by must be relevance_score, basic_price, created_at, or source_platform'),

  query('sort_dir')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('sort_dir must be ASC or DESC')
    .toUpperCase(),

  query('source_platform')
    .optional()
    .isIn(['immobiliare.it', 'casa.it', 'subito.it', 'idealista.it', 'tecnocasa.it', 'remax.it'])
    .withMessage('source_platform must be a supported platform'),

  query('min_relevance_score')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('min_relevance_score must be between 0 and 1')
    .toFloat(),

  
];

/**
 * Validator per execution stats query
 */
const validateExecutionStatsQuery = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('days must be between 1 and 365')
    .toInt(),

  
];

/**
 * Validator per retry failed execution
 */
const retryFailedExecution = [
  param('id')
    .isUUID(4)
    .withMessage('Search execution ID must be a valid UUID')
    .custom(async (value, { req }) => {
      // Verifica che l'esecuzione esista, sia fallita e appartenga all'utente
      const execution = await SearchExecution.findOne({
        where: {
          id: value,
          tenant_id: req.tenantId,
          status: 'failed'
        },
        include: [
          {
            model: SavedSearch,
            as: 'savedSearch',
            where: { user_id: req.user.id },
            attributes: ['id', 'is_active']
          }
        ]
      });
      
      if (!execution) {
        throw new Error('Failed search execution not found or access denied');
      }
      
      if (!execution.savedSearch.is_active) {
        throw new Error('Cannot retry execution for inactive saved search');
      }
      
      return true;
    }),

  
];

/**
 * Validator per cancel execution
 */
const cancelExecution = [
  param('id')
    .isUUID(4)
    .withMessage('Search execution ID must be a valid UUID')
    .custom(async (value, { req }) => {
      // Verifica che l'esecuzione esista, sia cancellabile e appartenga all'utente
      const execution = await SearchExecution.findOne({
        where: {
          id: value,
          tenant_id: req.tenantId,
          status: ['pending', 'running']
        },
        include: [
          {
            model: SavedSearch,
            as: 'savedSearch',
            where: { user_id: req.user.id },
            attributes: ['id']
          }
        ]
      });
      
      if (!execution) {
        throw new Error('Cancellable search execution not found or access denied');
      }
      
      return true;
    }),

  
];

/**
 * Validator per batch operations sulle executions
 */
const validateBatchExecutionOperation = [
  body('execution_ids')
    .isArray({ min: 1, max: 50 })
    .withMessage('execution_ids must be an array with 1-50 items'),

  body('execution_ids.*')
    .isUUID(4)
    .withMessage('Each execution_id must be a valid UUID'),

  body('operation')
    .isIn(['cancel', 'retry_failed', 'delete_completed'])
    .withMessage('operation must be cancel, retry_failed, or delete_completed'),

  
];

/**
 * Validator per execution monitoring query (per admin/system)
 */
const validateExecutionMonitoringQuery = [
  query('tenant_id')
    .optional()
    .isUUID(4)
    .withMessage('tenant_id must be a valid UUID'),

  query('status')
    .optional()
    .isIn(['pending', 'running', 'completed', 'failed', 'cancelled'])
    .withMessage('status must be a valid execution status'),

  query('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('priority must be low, normal, high, or urgent'),

  query('execution_type')
    .optional()
    .isIn(['manual', 'scheduled', 'retry'])
    .withMessage('execution_type must be manual, scheduled, or retry'),

  query('platform')
    .optional()
    .isIn(['immobiliare.it', 'casa.it', 'subito.it', 'idealista.it', 'tecnocasa.it', 'remax.it'])
    .withMessage('platform must be a supported platform'),

  query('duration_minutes_min')
    .optional()
    .isInt({ min: 0, max: 1440 })
    .withMessage('duration_minutes_min must be between 0 and 1440 (24 hours)')
    .toInt(),

  query('duration_minutes_max')
    .optional()
    .isInt({ min: 0, max: 1440 })
    .withMessage('duration_minutes_max must be between 0 and 1440 (24 hours)')
    .toInt(),

  
];

/**
 * Validator per webhooks sulle executions (per integrazioni esterne)
 */
const validateExecutionWebhook = [
  body('execution_id')
    .isUUID(4)
    .withMessage('execution_id must be a valid UUID'),

  body('webhook_event')
    .isIn(['execution_started', 'execution_completed', 'execution_failed', 'results_found'])
    .withMessage('webhook_event must be a valid event type'),

  body('webhook_data')
    .isObject()
    .withMessage('webhook_data must be an object'),

  body('webhook_signature')
    .optional()
    .isLength({ min: 10, max: 200 })
    .withMessage('webhook_signature must be between 10 and 200 characters'),

  
];

module.exports = {
  createSearchExecution,
  updateExecutionStatus,
  validateSearchExecutionQuery,
  validateSearchExecutionId,
  validateExecutionResultsQuery,
  validateExecutionStatsQuery,
  retryFailedExecution,
  cancelExecution,
  validateBatchExecutionOperation,
  validateExecutionMonitoringQuery,
  validateExecutionWebhook
};