'use strict';

const express = require('express');
const router = express.Router();
const searchResultController = require('../controllers/searchResultController');
const searchResultValidators = require('../validators/searchResultValidators');
const { authenticate } = require('../../middleware/authMiddleware');
const policyMiddlewareFactory = require('../../middleware/policyMiddlewareFactory');

/**
 * Routes per SearchResult - Gestione risultati di ricerca con metadata + AI analysis
 * Architettura legal-compliant: NO memorizzazione contenuti originali
 */

/**
 * @route GET /api/search-results
 * @desc Ottiene la lista dei risultati di ricerca con filtri avanzati
 * @access Private - In base ai permessi dell'utente
 * @query {number} page=1 - Numero pagina
 * @query {number} limit=20 - Risultati per pagina
 * @query {string} sort_by=relevance_score - Campo di ordinamento
 * @query {string} sort_dir=DESC - Direzione ordinamento
 * @query {string} search - Ricerca testuale
 * @query {string} source_platform - Filtra per piattaforma
 * @query {number} min_price - Prezzo minimo
 * @query {number} max_price - Prezzo massimo
 * @query {string} basic_location - Filtra per località
 * @query {number} min_relevance_score=0.3 - Score rilevanza minimo
 * @query {string} execution_id - Filtra per esecuzione specifica
 */
router.get('/',
  authenticate,
  searchResultValidators.validateSearchResultQuery,
  policyMiddlewareFactory.createList('SearchResult', { applyFilters: true }),
  searchResultController.getSearchResults
);

/**
 * @route GET /api/search-results/top
 * @desc Ottiene i migliori risultati recenti (alta rilevanza)
 * @access Private - Solo propri risultati
 * @query {number} limit=10 - Numero risultati
 * @query {number} days=7 - Giorni da considerare
 */
router.get('/top',
  authenticate,
  searchResultValidators.validateTopResultsQuery,
  policyMiddlewareFactory.create('SearchResult', 'read'),
  searchResultController.getTopResults
);

/**
 * @route GET /api/search-results/execution/:executionId
 * @desc Ottiene tutti i risultati per un'esecuzione specifica
 * @access Private - Solo se owner dell'esecuzione
 * @param {string} executionId - ID dell'esecuzione
 * @query {number} limit=50 - Numero massimo risultati
 * @query {string} sort_by=relevance_score - Campo di ordinamento
 * @query {string} sort_dir=DESC - Direzione ordinamento
 */
router.get('/execution/:executionId',
  authenticate,
  searchResultValidators.validateExecutionId,
  policyMiddlewareFactory.create('SearchResult', 'read'),
  searchResultController.getByExecutionId
);

/**
 * @route GET /api/search-results/:id
 * @desc Ottiene un risultato di ricerca specifico per ID
 * @access Private - Solo se owner dell'esecuzione correlata
 * @param {string} id - ID del risultato di ricerca
 */
router.get('/:id',
  authenticate,
  searchResultValidators.validateSearchResultId,
  policyMiddlewareFactory.create('SearchResult', 'read'),
  searchResultController.getSearchResultById
);

/**
 * @route POST /api/search-results
 * @desc Crea un nuovo risultato di ricerca (solo sistema interno)
 * @access Private - Solo scraping service e admin
 * @body {string} execution_id - ID dell'esecuzione
 * @body {string} external_url - URL originale dell'annuncio
 * @body {string} source_platform - Piattaforma sorgente
 * @body {string} basic_title - Titolo di riferimento
 * @body {number} basic_price - Prezzo per filtering
 * @body {string} basic_location - Località per grouping
 * @body {number} relevance_score - Score di rilevanza (0-1)
 * @body {object} ai_insights - Analisi AI strutturata
 * @body {string} ai_summary - Riassunto generato da AI
 * @body {string} ai_recommendation - Raccomandazione AI
 */
router.post('/',
  authenticate,
  searchResultValidators.createSearchResult,
  policyMiddlewareFactory.create('SearchResult', 'create'),
  searchResultController.createSearchResult
);

/**
 * @route PUT /api/search-results/:id/ai-analysis
 * @desc Aggiorna l'analisi AI di un risultato di ricerca
 * @access Private - Solo sistema AI e admin
 * @param {string} id - ID del risultato di ricerca
 * @body {object} ai_insights - Analisi AI aggiornata
 * @body {string} ai_summary - Riassunto aggiornato
 * @body {string} ai_recommendation - Raccomandazione aggiornata
 * @body {number} relevance_score - Score rilevanza aggiornato
 */
router.put('/:id/ai-analysis',
  authenticate,
  searchResultValidators.updateAIAnalysis,
  policyMiddlewareFactory.create('SearchResult', 'update'),
  searchResultController.updateAIAnalysis
);

/**
 * @route PATCH /api/search-results/:id/viewed
 * @desc Marca un risultato come visualizzato dall'utente
 * @access Private - Solo owner dell'esecuzione
 * @param {string} id - ID del risultato di ricerca
 */
router.patch('/:id/viewed',
  authenticate,
  searchResultValidators.markAsViewed,
  policyMiddlewareFactory.create('SearchResult', 'update'),
  searchResultController.markAsViewed
);

/**
 * @route DELETE /api/search-results/:id
 * @desc Elimina un risultato di ricerca (soft delete)
 * @access Private - Solo admin o sistema di cleanup
 * @param {string} id - ID del risultato di ricerca
 */
router.delete('/:id',
  authenticate,
  searchResultValidators.validateSearchResultId,
  policyMiddlewareFactory.create('SearchResult', 'delete'),
  searchResultController.deleteSearchResult
);

/**
 * @route PUT /api/search-results/batch
 * @desc Operazioni batch sui risultati di ricerca (future use)
 * @access Private - Solo admin
 * @body {array} search_result_ids - Array di ID risultati
 * @body {object} updates - Aggiornamenti da applicare
 */
router.put('/batch',
  authenticate,
  searchResultValidators.validateBatchUpdate,
  policyMiddlewareFactory.create('SearchResult', 'update'),
  // TODO: Implementare batchUpdateSearchResults controller method
  (req, res) => res.status(501).json({ status: 'error', message: 'Batch operations not yet implemented' })
);

module.exports = router;