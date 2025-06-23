'use strict';

const express = require('express');
const router = express.Router();
const searchExecutionController = require('../controllers/searchExecutionController');
const searchExecutionValidators = require('../validators/searchExecutionValidators');
const { authenticate } = require('../../middleware/authMiddleware');
const policyMiddlewareFactory = require('../../middleware/policyMiddlewareFactory');

/**
 * Routes per SearchExecution - Gestione tracking e stato delle esecuzioni di ricerca
 * User può gestire solo le esecuzioni delle proprie SavedSearch
 */

/**
 * @route GET /api/search-executions
 * @desc Ottiene la lista delle esecuzioni di ricerca dell'utente
 * @access Private - Solo proprie esecuzioni
 * @query {number} page=1 - Numero pagina
 * @query {number} limit=20 - Risultati per pagina
 * @query {string} sort_by=started_at - Campo di ordinamento
 * @query {string} sort_dir=DESC - Direzione ordinamento
 * @query {string} status - Filtra per stato esecuzione
 * @query {string} execution_type - Filtra per tipo esecuzione
 * @query {string} saved_search_id - Filtra per ricerca salvata specifica
 * @query {string} date_from - Data inizio periodo (ISO8601)
 * @query {string} date_to - Data fine periodo (ISO8601)
 */
router.get('/',
  authenticate,
  searchExecutionValidators.validateSearchExecutionQuery,
  policyMiddlewareFactory.createList('SearchExecution', { applyFilters: true }),
  searchExecutionController.getSearchExecutions
);

/**
 * @route GET /api/search-executions/active
 * @desc Ottiene le esecuzioni attualmente attive (pending/running)
 * @access Private - Solo proprie esecuzioni
 */
router.get('/active',
  authenticate,
  policyMiddlewareFactory.create('SearchExecution', 'read'),
  searchExecutionController.getActiveExecutions
);

/**
 * @route GET /api/search-executions/stats
 * @desc Ottiene statistiche delle esecuzioni dell'utente
 * @access Private - Solo proprie statistiche
 * @query {number} days=30 - Giorni da considerare per le statistiche
 */
router.get('/stats',
  authenticate,
  searchExecutionValidators.validateExecutionStatsQuery,
  policyMiddlewareFactory.create('SearchExecution', 'read'),
  searchExecutionController.getExecutionStats
);

/**
 * @route GET /api/search-executions/:id
 * @desc Ottiene un'esecuzione di ricerca specifica per ID
 * @access Private - Solo se owner della SavedSearch correlata
 * @param {string} id - ID dell'esecuzione di ricerca
 */
router.get('/:id',
  authenticate,
  searchExecutionValidators.validateSearchExecutionId,
  policyMiddlewareFactory.create('SearchExecution', 'read'),
  searchExecutionController.getSearchExecutionById
);

/**
 * @route GET /api/search-executions/:id/results
 * @desc Ottiene i risultati di un'esecuzione specifica
 * @access Private - Solo se owner dell'esecuzione
 * @param {string} id - ID dell'esecuzione di ricerca
 * @query {number} page=1 - Numero pagina
 * @query {number} limit=20 - Risultati per pagina
 * @query {string} sort_by=relevance_score - Campo di ordinamento
 * @query {string} sort_dir=DESC - Direzione ordinamento
 * @query {string} source_platform - Filtra per piattaforma
 * @query {number} min_relevance_score=0 - Score rilevanza minimo
 */
router.get('/:id/results',
  authenticate,
  searchExecutionValidators.validateExecutionResultsQuery,
  policyMiddlewareFactory.create('SearchExecution', 'read'),
  searchExecutionController.getExecutionResults
);

/**
 * @route GET /api/search-executions/:id/logs
 * @desc Ottiene i log di errore di un'esecuzione
 * @access Private - Solo se owner dell'esecuzione
 * @param {string} id - ID dell'esecuzione di ricerca
 */
router.get('/:id/logs',
  authenticate,
  searchExecutionValidators.validateSearchExecutionId,
  policyMiddlewareFactory.create('SearchExecution', 'read'),
  searchExecutionController.getExecutionLogs
);

/**
 * @route POST /api/search-executions
 * @desc Crea una nuova esecuzione di ricerca
 * @access Private - Solo per proprie SavedSearch
 * @body {string} saved_search_id - ID della ricerca salvata
 * @body {string} execution_type=manual - Tipo di esecuzione
 * @body {array} platforms_searched - Piattaforme da interrogare (opzionale)
 * @body {string} priority=normal - Priorità esecuzione
 */
router.post('/',
  authenticate,
  searchExecutionValidators.createSearchExecution,
  policyMiddlewareFactory.create('SearchExecution', 'create'),
  searchExecutionController.createSearchExecution
);

/**
 * @route PUT /api/search-executions/:id/status
 * @desc Aggiorna lo stato di un'esecuzione di ricerca
 * @access Private - Solo sistema interno (scraping service) e admin
 * @param {string} id - ID dell'esecuzione di ricerca
 * @body {string} status - Nuovo stato
 * @body {array} platforms_searched - Piattaforme interrogate (opzionale)
 * @body {number} total_results_found - Totale risultati trovati (opzionale)
 * @body {number} new_results_count - Nuovi risultati rispetto a precedenti (opzionale)
 * @body {array} execution_errors - Errori durante l'esecuzione (opzionale)
 * @body {string} completed_at - Timestamp completamento (opzionale)
 */
router.put('/:id/status',
  authenticate,
  searchExecutionValidators.updateExecutionStatus,
  policyMiddlewareFactory.create('SearchExecution', 'update'),
  searchExecutionController.updateExecutionStatus
);

/**
 * @route POST /api/search-executions/:id/retry
 * @desc Riprova un'esecuzione fallita
 * @access Private - Solo se owner dell'esecuzione fallita
 * @param {string} id - ID dell'esecuzione fallita
 */
router.post('/:id/retry',
  authenticate,
  searchExecutionValidators.retryFailedExecution,
  policyMiddlewareFactory.create('SearchExecution', 'create'),
  searchExecutionController.retryFailedExecution
);

/**
 * @route PATCH /api/search-executions/:id/cancel
 * @desc Cancella un'esecuzione in corso
 * @access Private - Solo se owner dell'esecuzione
 * @param {string} id - ID dell'esecuzione da cancellare
 */
router.patch('/:id/cancel',
  authenticate,
  searchExecutionValidators.cancelExecution,
  policyMiddlewareFactory.create('SearchExecution', 'update'),
  searchExecutionController.cancelExecution
);

/**
 * @route PUT /api/search-executions/batch
 * @desc Operazioni batch sulle esecuzioni
 * @access Private - Solo proprie esecuzioni
 * @body {array} execution_ids - Array di ID esecuzioni
 * @body {string} operation - Operazione (cancel, retry_failed, delete_completed)
 */
router.put('/batch',
  authenticate,
  searchExecutionValidators.validateBatchExecutionOperation,
  policyMiddlewareFactory.create('SearchExecution', 'update'),
  // TODO: Implementare batchOperationExecutions controller method
  (req, res) => res.status(501).json({ status: 'error', message: 'Batch operations not yet implemented' })
);

/**
 * @route GET /api/search-executions/monitoring/overview
 * @desc Overview delle esecuzioni per monitoring di sistema (admin only)
 * @access Private - Solo admin e system monitoring
 * @query {string} tenant_id - Filtra per tenant specifico (opzionale)
 * @query {string} status - Filtra per stato (opzionale)
 * @query {string} priority - Filtra per priorità (opzionale)
 * @query {string} execution_type - Filtra per tipo (opzionale)
 * @query {string} platform - Filtra per piattaforma (opzionale)
 * @query {number} duration_minutes_min - Durata minima in minuti (opzionale)
 * @query {number} duration_minutes_max - Durata massima in minuti (opzionale)
 */
router.get('/monitoring/overview',
  authenticate,
  searchExecutionValidators.validateExecutionMonitoringQuery,
  policyMiddlewareFactory.create('SearchExecution', 'read', { resource: 'SystemMonitoring' }),
  // TODO: Implementare getExecutionMonitoringOverview controller method
  (req, res) => res.status(501).json({ status: 'error', message: 'Monitoring overview not yet implemented' })
);

/**
 * @route POST /api/search-executions/webhook
 * @desc Webhook per aggiornamenti di stato dalle esecuzioni (sistema interno)
 * @access Private - Solo sistema interno con autenticazione webhook
 * @body {string} execution_id - ID dell'esecuzione
 * @body {string} webhook_event - Tipo di evento
 * @body {object} webhook_data - Dati dell'evento
 * @body {string} webhook_signature - Firma webhook per sicurezza (opzionale)
 */
router.post('/webhook',
  authenticate,
  searchExecutionValidators.validateExecutionWebhook,
  policyMiddlewareFactory.create('SearchExecution', 'update', { resource: 'SystemWebhook' }),
  // TODO: Implementare handleExecutionWebhook controller method
  (req, res) => res.status(501).json({ status: 'error', message: 'Webhook handling not yet implemented' })
);

module.exports = router;