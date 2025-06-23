'use strict';

const express = require('express');
const router = express.Router();
const savedSearchController = require('../controllers/savedSearchController');
const savedSearchValidators = require('../validators/savedSearchValidators');
const { authenticate } = require('../../middleware/authMiddleware');
const policyMiddlewareFactory = require('../../middleware/policyMiddlewareFactory');

/**
 * Routes per SavedSearch - Gestione criteri di ricerca e configurazione esecuzioni
 * User può gestire solo le proprie ricerche salvate
 */

/**
 * @route GET /api/saved-searches
 * @desc Ottiene la lista delle ricerche salvate dell'utente
 * @access Private - Solo proprie ricerche
 * @query {number} page=1 - Numero pagina
 * @query {number} limit=10 - Risultati per pagina
 * @query {string} sort_by=updated_at - Campo di ordinamento
 * @query {string} sort_dir=DESC - Direzione ordinamento
 * @query {string} search - Ricerca testuale su nome e query
 * @query {boolean} is_active - Filtra per stato attivo/inattivo
 * @query {string} execution_frequency - Filtra per frequenza esecuzione
 */
router.get('/',
  authenticate,
  savedSearchValidators.validateSavedSearchQuery,
  policyMiddlewareFactory.createList('SavedSearch', { applyFilters: true }),
  savedSearchController.getSavedSearches
);

/**
 * @route GET /api/saved-searches/stats
 * @desc Ottiene statistiche delle ricerche salvate dell'utente
 * @access Private - Solo proprie statistiche
 */
router.get('/stats',
  authenticate,
  savedSearchValidators.validateSearchStatsQuery,
  policyMiddlewareFactory.create('SavedSearch', 'read'),
  savedSearchController.getSearchStats
);

/**
 * @route GET /api/saved-searches/:id
 * @desc Ottiene una ricerca salvata specifica per ID
 * @access Private - Solo se owner
 * @param {string} id - ID della ricerca salvata
 */
router.get('/:id',
  authenticate,
  savedSearchValidators.validateSavedSearchId,
  policyMiddlewareFactory.create('SavedSearch', 'read'),
  savedSearchController.getSavedSearchById
);

/**
 * @route GET /api/saved-searches/:id/executions
 * @desc Ottiene lo storico delle esecuzioni per una ricerca salvata
 * @access Private - Solo se owner della ricerca
 * @param {string} id - ID della ricerca salvata
 * @query {number} page=1 - Numero pagina
 * @query {number} limit=10 - Risultati per pagina
 */
router.get('/:id/executions',
  authenticate,
  savedSearchValidators.validateExecutionHistoryQuery,
  policyMiddlewareFactory.create('SavedSearch', 'read'),
  savedSearchController.getExecutionHistory
);

/**
 * @route POST /api/saved-searches
 * @desc Crea una nuova ricerca salvata
 * @access Private - Authenticated users
 * @body {string} name - Nome univoco per l'utente
 * @body {string} natural_language_query - Query in linguaggio naturale (opzionale)
 * @body {object} structured_criteria - Criteri strutturati (opzionale)
 * @body {string} execution_frequency=manual - Frequenza esecuzione
 * @body {boolean} notify_on_new_results=false - Notifiche nuovi risultati
 */
router.post('/',
  authenticate,
  savedSearchValidators.createSavedSearch,
  policyMiddlewareFactory.create('SavedSearch', 'create'),
  savedSearchController.createSavedSearch
);

/**
 * @route POST /api/saved-searches/:id/execute
 * @desc Esegue una ricerca salvata (crea SearchExecution)
 * @access Private - Solo se owner della ricerca
 * @param {string} id - ID della ricerca salvata
 * @body {string} execution_type=manual - Tipo di esecuzione
 */
router.post('/:id/execute',
  authenticate,
  savedSearchValidators.executeSavedSearch,
  policyMiddlewareFactory.create('SavedSearch', 'read'),
  savedSearchController.executeSavedSearch
);

/**
 * @route POST /api/saved-searches/:id/duplicate
 * @desc Duplica una ricerca salvata esistente
 * @access Private - Solo se owner della ricerca originale
 * @param {string} id - ID della ricerca da duplicare
 * @body {string} name - Nome per la duplicata (opzionale)
 */
router.post('/:id/duplicate',
  authenticate,
  savedSearchValidators.duplicateSavedSearch,
  policyMiddlewareFactory.create('SavedSearch', 'read'),
  savedSearchController.duplicateSavedSearch
);

/**
 * @route PUT /api/saved-searches/:id
 * @desc Aggiorna una ricerca salvata esistente
 * @access Private - Solo se owner
 * @param {string} id - ID della ricerca salvata
 * @body {string} name - Nome aggiornato (opzionale)
 * @body {string} natural_language_query - Query aggiornata (opzionale)
 * @body {object} structured_criteria - Criteri aggiornati (opzionale)
 * @body {string} execution_frequency - Frequenza aggiornata (opzionale)
 * @body {boolean} notify_on_new_results - Notifiche aggiornate (opzionale)
 * @body {boolean} is_active - Stato attivo aggiornato (opzionale)
 */
router.put('/:id',
  authenticate,
  savedSearchValidators.updateSavedSearch,
  policyMiddlewareFactory.create('SavedSearch', 'update'),
  savedSearchController.updateSavedSearch
);

/**
 * @route PATCH /api/saved-searches/:id/toggle-active
 * @desc Attiva/Disattiva una ricerca salvata
 * @access Private - Solo se owner
 * @param {string} id - ID della ricerca salvata
 */
router.patch('/:id/toggle-active',
  authenticate,
  savedSearchValidators.validateSavedSearchId,
  policyMiddlewareFactory.create('SavedSearch', 'update'),
  savedSearchController.toggleActive
);

/**
 * @route DELETE /api/saved-searches/:id
 * @desc Elimina una ricerca salvata (soft delete)
 * @access Private - Solo se owner
 * @param {string} id - ID della ricerca salvata
 */
router.delete('/:id',
  authenticate,
  savedSearchValidators.validateSavedSearchId,
  policyMiddlewareFactory.create('SavedSearch', 'delete'),
  savedSearchController.deleteSavedSearch
);

/**
 * @route PUT /api/saved-searches/batch
 * @desc Operazioni batch sulle ricerche salvate
 * @access Private - Solo proprie ricerche
 * @body {array} saved_search_ids - Array di ID ricerche
 * @body {string} operation - Operazione (activate, deactivate, delete, set_frequency)
 * @body {string} frequency - Frequenza (richiesta per set_frequency)
 */
router.put('/batch',
  authenticate,
  savedSearchValidators.validateBatchOperation,
  policyMiddlewareFactory.create('SavedSearch', 'update'),
  // TODO: Implementare batchOperationSavedSearches controller method
  (req, res) => res.status(501).json({ status: 'error', message: 'Batch operations not yet implemented' })
);

/**
 * @route POST /api/saved-searches/import
 * @desc Importa ricerche salvate da file/backup
 * @access Private - Solo per proprio account
 * @body {array} saved_searches - Array di ricerche da importare
 * @body {boolean} overwrite_existing=false - Sovrascrive ricerche esistenti
 */
router.post('/import',
  authenticate,
  savedSearchValidators.validateImportSavedSearches,
  policyMiddlewareFactory.create('SavedSearch', 'create'),
  // TODO: Implementare importSavedSearches controller method
  (req, res) => res.status(501).json({ status: 'error', message: 'Import functionality not yet implemented' })
);

/**
 * @route GET /api/saved-searches/export
 * @desc Esporta tutte le ricerche salvate dell'utente
 * @access Private - Solo proprie ricerche
 * @query {string} format=json - Formato export (json, csv)
 */
router.get('/export',
  authenticate,
  policyMiddlewareFactory.create('SavedSearch', 'read'),
  // TODO: Implementare exportSavedSearches controller method
  (req, res) => res.status(501).json({ status: 'error', message: 'Export functionality not yet implemented' })
);

module.exports = router;