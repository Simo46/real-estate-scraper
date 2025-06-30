'use strict';

const { createLogger } = require('../utils/logger');
const logger = createLogger('services:searchOrchestrator');

/**
 * Search Orchestrator - Gestisce il workflow multi-step delle ricerche
 * Responsabilità:
 * - Gestire il workflow multi-step delle ricerche
 * - Coordinare i diversi servizi (parser, builder, generator)
 * - Applicare business rules e validazioni
 * - Gestire parallelizzazione (future multiple platforms)
 */
class SearchOrchestrator {
  constructor() {
    // Inizializzazione lazy per evitare circular dependencies
    this.queryParser = null;
    this.criteriaBuilder = null;
    this.mockDataService = null;
  }

  /**
   * Inizializzazione lazy dei servizi dipendenti
   */
  _initializeDependencies() {
    if (!this.queryParser) {
      const QueryParser = require('../utils/queryParser');
      this.queryParser = new QueryParser();
    }
    if (!this.criteriaBuilder) {
      const CriteriaBuilder = require('../utils/criteriaBuilder');
      this.criteriaBuilder = new CriteriaBuilder();
    }
    if (!this.mockDataService) {
      const MockDataService = require('./mockDataService');
      this.mockDataService = new MockDataService();
    }
  }

  /**
   * Orchestratore principale del flusso di ricerca
   * @param {Object} savedSearch - Ricerca salvata
   * @param {string} executionId - ID dell'esecuzione
   * @param {Object} context - Contesto utente
   * @returns {Array} Array di risultati processati
   */
  async orchestrateSearchFlow(savedSearch, executionId, context) {
    this._initializeDependencies();

    logger.info('Starting search orchestration', {
      savedSearchId: savedSearch.id,
      executionId,
      tenant_id: context.tenant_id
    });

    try {
      // Step 1: Validation
      await this.executeStep('validation', {
        savedSearch,
        context
      }, executionId);

      // Step 2: Preprocessing
      const preprocessedData = await this.executeStep('preprocessing', {
        savedSearch,
        context
      }, executionId);

      // Step 3: Execution (Data Retrieval)
      const rawResults = await this.executeStep('execution', {
        criteria: preprocessedData.criteria,
        savedSearch,
        context
      }, executionId);

      // Step 4: Processing
      const processedResults = await this.executeStep('processing', {
        rawResults,
        criteria: preprocessedData.criteria,
        context
      }, executionId);

      // Step 5: Finalization
      const finalResults = await this.executeStep('finalization', {
        processedResults,
        savedSearch,
        executionId,
        context
      }, executionId);

      logger.info('Search orchestration completed', {
        savedSearchId: savedSearch.id,
        executionId,
        resultsCount: finalResults.length
      });

      return finalResults;

    } catch (error) {
      logger.error('Search orchestration failed', {
        error: error.message,
        stack: error.stack,
        savedSearchId: savedSearch.id,
        executionId
      });
      throw error;
    }
  }

  /**
   * Esegue un singolo step del workflow
   * @param {string} stepName - Nome dello step
   * @param {Object} stepData - Dati per lo step
   * @param {string} executionId - ID dell'esecuzione
   * @returns {*} Risultato dello step
   */
  async executeStep(stepName, stepData, executionId) {
    const startTime = Date.now();

    try {
      logger.debug(`Executing step: ${stepName}`, { executionId });

      let result;

      switch (stepName) {
        case 'validation':
          result = await this._executeValidationStep(stepData);
          break;
        case 'preprocessing':
          result = await this._executePreprocessingStep(stepData);
          break;
        case 'execution':
          result = await this._executeExecutionStep(stepData, executionId);
          break;
        case 'processing':
          result = await this._executeProcessingStep(stepData);
          break;
        case 'finalization':
          result = await this._executeFinalizationStep(stepData);
          break;
        default:
          throw new Error(`Unknown step: ${stepName}`);
      }

      const duration = Date.now() - startTime;
      logger.debug(`Step ${stepName} completed`, {
        executionId,
        durationMs: duration
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Step ${stepName} failed`, {
        error: error.message,
        executionId,
        durationMs: duration
      });

      await this.handleStepFailure(stepName, error, executionId);
      throw error;
    }
  }

  /**
   * Step 1: Validation - Valida criteri e permessi utente
   */
  async _executeValidationStep({ savedSearch, context }) {
    // Validazione business rules
    if (!savedSearch.is_active) {
      throw new Error('Cannot execute inactive saved search');
    }

    // Validazione criteri strutturati
    if (savedSearch.structured_criteria) {
      const validation = await this._validateCriteria(savedSearch.structured_criteria);
      if (!validation.valid) {
        throw new Error(`Invalid criteria: ${validation.errors.join(', ')}`);
      }
    }

    return { validated: true };
  }

  /**
   * Step 2: Preprocessing - Parsing e arricchimento criteri
   */
  async _executePreprocessingStep({ savedSearch, context }) {
    let criteria = {};

    // Se abbiamo structured_criteria, usiamo quelli
    if (savedSearch.structured_criteria) {
      criteria = await this.criteriaBuilder.buildCriteriaFromStructured(
        savedSearch.structured_criteria
      );
    } 
    // Altrimenti proviamo a parsare il natural language
    else if (savedSearch.natural_language_query) {
      const parsedQuery = await this.queryParser.parseNaturalLanguage(
        savedSearch.natural_language_query
      );
      criteria = await this.criteriaBuilder.buildCriteriaFromParsed(parsedQuery);
    }
    else {
      throw new Error('No search criteria found');
    }

    // Arricchimento con preferenze utente (se disponibili)
    if (context.userPreferences) {
      criteria = await this.criteriaBuilder.mergeCriteriaWithPreferences(
        criteria, 
        context.userPreferences
      );
    }

    // Applicazione filtri business
    criteria = await this.applySearchFilters(criteria, context.userProfile);

    return { 
      criteria,
      preprocessed: true 
    };
  }

  /**
   * Step 3: Execution - Recupero dati (mock per ora)
   */
  async _executeExecutionStep({ criteria, savedSearch, context }, executionId) {
    // Per ora usiamo il MockDataService, in futuro il scraping service
    const rawResults = await this.mockDataService.simulateSearch(
      criteria, 
      executionId
    );

    return rawResults;
  }

  /**
   * Step 4: Processing - Elaborazione risultati
   */
  async _executeProcessingStep({ rawResults, criteria, context }) {
    let processedResults = rawResults;

    // Deduplicazione
    processedResults = await this.deduplicateResults(processedResults);

    // Scoring e ranking
    processedResults = await this.scoreAndRankResults(processedResults, criteria);

    return processedResults;
  }

  /**
   * Step 5: Finalization - Salvataggio risultati
   */
  async _executeFinalizationStep({ processedResults, savedSearch, executionId, context }) {
    const { SearchResult } = require('../models');

    const finalResults = [];

    for (const result of processedResults) {
      try {
        const searchResult = await SearchResult.create({
          tenant_id: context.tenant_id,
          execution_id: executionId,
          external_url: result.external_url,
          source_platform: result.source_platform,
          basic_title: result.basic_title,
          basic_price: result.basic_price,
          basic_location: result.basic_location,
          relevance_score: result.relevance_score,
          ai_insights: result.ai_insights,
          ai_summary: result.ai_summary,
          ai_recommendation: result.ai_recommendation,
          created_by: context.user_id,
          updated_by: context.user_id
        });

        finalResults.push(searchResult);

      } catch (error) {
        logger.error('Failed to save search result', {
          error: error.message,
          executionId,
          resultUrl: result.external_url
        });
        // Continuiamo con gli altri risultati
      }
    }

    return finalResults;
  }

  /**
   * Gestisce il fallimento di uno step
   * @param {string} stepName - Nome dello step fallito
   * @param {Error} error - Errore occorso
   * @param {string} executionId - ID dell'esecuzione
   */
  async handleStepFailure(stepName, error, executionId) {
    logger.error(`Step failure: ${stepName}`, {
      error: error.message,
      executionId,
      step: stepName
    });

    // Per ora solo logging, in futuro potremmo implementare
    // strategie di recovery specifiche per step
  }

  /**
   * Applica filtri di ricerca business
   * @param {Object} criteria - Criteri di base
   * @param {Object} userProfile - Profilo utente
   * @returns {Object} Criteri filtrati
   */
  async applySearchFilters(criteria, userProfile) {
    const filteredCriteria = { ...criteria };

    // Applica preferenze di ricerca dell'utente se disponibili
    if (userProfile?.search_preferences) {
      const prefs = userProfile.search_preferences;
      
      // Filtra per budget preferito
      if (prefs.max_budget && (!criteria.price?.max || criteria.price.max > prefs.max_budget)) {
        filteredCriteria.price = {
          ...filteredCriteria.price,
          max: prefs.max_budget
        };
      }

      // Filtra per zone preferite
      if (prefs.preferred_areas?.length > 0) {
        filteredCriteria.location = {
          ...filteredCriteria.location,
          preferred_areas: prefs.preferred_areas
        };
      }
    }

    return filteredCriteria;
  }

  /**
   * Calcola pesi di rilevanza
   * @param {Object} criteria - Criteri di ricerca
   * @param {Object} userPreferences - Preferenze utente
   * @returns {Object} Pesi calcolati
   */
  async calculateRelevanceWeights(criteria, userPreferences) {
    const weights = {
      location: 0.3,
      price: 0.25,
      size: 0.2,
      condition: 0.15,
      features: 0.1
    };

    // Aggiusta pesi basandosi sulle preferenze
    if (userPreferences?.priorities) {
      const priorities = userPreferences.priorities;
      
      if (priorities.location === 'high') weights.location *= 1.5;
      if (priorities.price === 'high') weights.price *= 1.5;
      if (priorities.size === 'high') weights.size *= 1.5;
    }

    // Normalizza pesi
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    Object.keys(weights).forEach(key => {
      weights[key] = weights[key] / totalWeight;
    });

    return weights;
  }

  /**
   * Prioritizza piattaforme (preparazione multi-platform)
   * @param {Object} criteria - Criteri di ricerca
   * @returns {Array} Piattaforme ordinate per priorità
   */
  async prioritizePlatforms(criteria) {
    const platforms = [
      {
        name: 'immobiliare.it',
        priority: 1,
        strengths: ['coverage', 'data_quality'],
        suitable_for: ['apartments', 'houses']
      },
      {
        name: 'casa.it',
        priority: 2,
        strengths: ['luxury', 'detailed_info'],
        suitable_for: ['villas', 'luxury']
      }
    ];

    // Ordina per priorità e compatibilità con i criteri
    return platforms
      .filter(platform => this._isPlatformSuitable(platform, criteria))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Deduplica risultati
   * @param {Array} results - Risultati da deduplicare
   * @returns {Array} Risultati deduplicati
   */
  async deduplicateResults(results) {
    const seen = new Set();
    const deduplicated = [];

    for (const result of results) {
      // Crea chiave unica basata su titolo e prezzo
      const key = `${result.basic_title?.toLowerCase()}_${result.basic_price}_${result.basic_location?.toLowerCase()}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(result);
      }
    }

    logger.debug('Results deduplicated', {
      originalCount: results.length,
      deduplicatedCount: deduplicated.length,
      duplicatesRemoved: results.length - deduplicated.length
    });

    return deduplicated;
  }

  /**
   * Scoring e ranking dei risultati
   * @param {Array} results - Risultati da ordinare
   * @param {Object} criteria - Criteri di ricerca
   * @returns {Array} Risultati ordinati
   */
  async scoreAndRankResults(results, criteria) {
    const weights = await this.calculateRelevanceWeights(criteria, {});

    // Calcola score per ogni risultato
    const scoredResults = results.map(result => {
      let score = 0;

      // Score location (semplificato)
      if (criteria.location?.city && result.basic_location?.includes(criteria.location.city)) {
        score += weights.location;
      }

      // Score price (vicinanza al target)
      if (criteria.price && result.basic_price) {
        const targetPrice = (criteria.price.min + criteria.price.max) / 2;
        const priceDiff = Math.abs(result.basic_price - targetPrice) / targetPrice;
        score += weights.price * Math.max(0, 1 - priceDiff);
      }

      // AI insights bonus
      if (result.ai_insights?.match_score) {
        score += result.ai_insights.match_score * 0.1;
      }

      return {
        ...result,
        relevance_score: Math.min(1, score)
      };
    });

    // Ordina per score decrescente
    return scoredResults.sort((a, b) => b.relevance_score - a.relevance_score);
  }

  /**
   * Utilities
   */
  async _validateCriteria(criteria) {
    // Validazione basica per ora
    const validation = { valid: true, errors: [] };

    if (criteria.price && criteria.price.min > criteria.price.max) {
      validation.valid = false;
      validation.errors.push('Invalid price range');
    }

    return validation;
  }

  _isPlatformSuitable(platform, criteria) {
    // Per ora tutti i platform sono adatti
    // In futuro logica più sofisticata
    return true;
  }
}

module.exports = SearchOrchestrator;
