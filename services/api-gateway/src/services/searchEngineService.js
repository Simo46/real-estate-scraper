'use strict';

const { SearchExecution, SavedSearch, SearchResult, sequelize } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { createLogger } = require('../utils/logger');
const logger = createLogger('services:searchEngine');

/**
 * Search Engine Service - Core orchestrator per il sistema di ricerca immobiliare
 * Responsabilità:
 * - Orchestrare l'intero flusso di esecuzione ricerca
 * - Gestire stati e transizioni di SearchExecution
 * - Coordinare parsing, criteria building, e data retrieval
 * - Error handling e recovery mechanisms
 * - Performance tracking e metrics
 */
class SearchEngineService {
  constructor() {
    this.searchOrchestrator = null; // Sarà inizializzato lazqy
    this.mockDataService = null; // Sarà inizializzato lazy
  }

  /**
   * Inizializzazione lazy dei servizi dipendenti per evitare circular dependencies
   */
  _initializeDependencies() {
    if (!this.searchOrchestrator) {
      const SearchOrchestrator = require('./searchOrchestrator');
      this.searchOrchestrator = new SearchOrchestrator();
    }
    if (!this.mockDataService) {
      const MockDataService = require('./mockDataService');
      this.mockDataService = new MockDataService();
    }
  }

  /**
   * Esegue una ricerca salvata (entry point principale)
   * @param {string} savedSearchId - ID della ricerca salvata
   * @param {string} executionType - Tipo di esecuzione ('manual', 'scheduled', 'automatic')
   * @param {Object} context - Contesto con tenant_id, user_id, etc.
   * @returns {Object} SearchExecution object
   */
  async executeSearch(savedSearchId, executionType = 'manual', context = {}) {
    const transaction = await sequelize.transaction();
    let searchExecution = null;

    try {
      this._initializeDependencies();

      logger.info('Starting search execution', {
        savedSearchId,
        executionType,
        tenant_id: context.tenant_id,
        user_id: context.user_id
      });

      // 1. Carica e valida la ricerca salvata
      const savedSearch = await SavedSearch.findOne({
        where: {
          id: savedSearchId,
          tenant_id: context.tenant_id,
          is_active: true
        }
      });

      if (!savedSearch) {
        throw AppError.notFound('Active saved search not found');
      }

      // 2. Crea SearchExecution record
      searchExecution = await SearchExecution.create({
        tenant_id: context.tenant_id,
        saved_search_id: savedSearchId,
        execution_type: executionType,
        status: 'pending',
        started_at: new Date(),
        platforms_searched: [],
        total_results_found: 0,
        new_results_count: 0,
        execution_errors: [],
        created_by: context.user_id,
        updated_by: context.user_id
      }, { transaction });

      await transaction.commit();

      // 3. Avvia elaborazione asincrona
      this._processSearchExecutionAsync(searchExecution.id, savedSearch, context);

      return searchExecution;

    } catch (error) {
      await transaction.rollback();
      
      // Se abbiamo creato l'execution, aggiorniamo lo status
      if (searchExecution) {
        await this.handleExecutionError(searchExecution.id, error);
      }

      logger.error('Failed to start search execution', {
        error: error.message,
        savedSearchId,
        executionType,
        tenant_id: context.tenant_id
      });

      throw error;
    }
  }

  /**
   * Elaborazione asincrona dell'esecuzione
   * @param {string} executionId - ID dell'esecuzione
   * @param {Object} savedSearch - Oggetto SavedSearch
   * @param {Object} context - Contesto utente
   */
  async _processSearchExecutionAsync(executionId, savedSearch, context) {
    try {
      await this.processSearchExecution(executionId, savedSearch, context);
    } catch (error) {
      logger.error('Async search execution failed', {
        error: error.message,
        executionId,
        savedSearchId: savedSearch.id
      });
      await this.handleExecutionError(executionId, error);
    }
  }

  /**
   * Processa una SearchExecution esistente
   * @param {string} executionId - ID dell'esecuzione
   * @param {Object} savedSearch - Oggetto SavedSearch (opzionale)
   * @param {Object} context - Contesto utente
   */
  async processSearchExecution(executionId, savedSearch = null, context = {}) {
    const startTime = Date.now();

    try {
      logger.info('Processing search execution', { executionId });

      // 1. Aggiorna status a 'running'
      await this.updateExecutionStatus(executionId, 'running', {
        processing_started_at: new Date()
      });

      // 2. Carica savedSearch se non fornita
      if (!savedSearch) {
        const execution = await SearchExecution.findByPk(executionId, {
          include: [{ model: SavedSearch, as: 'savedSearch' }]
        });
        savedSearch = execution.savedSearch;
        context.tenant_id = execution.tenant_id;
      }

      // 3. Delega orchestrazione al SearchOrchestrator
      const results = await this.searchOrchestrator.orchestrateSearchFlow(
        savedSearch, 
        executionId, 
        context
      );

      // 4. Finalizza esecuzione
      await this.finalizeExecution(executionId, results);

      // 5. Registra metriche
      const executionTime = Date.now() - startTime;
      await this.recordExecutionMetrics(executionId, {
        execution_time_ms: executionTime,
        results_count: results.length,
        success: true
      });

      logger.info('Search execution completed successfully', {
        executionId,
        resultsCount: results.length,
        executionTimeMs: executionTime
      });

    } catch (error) {
      logger.error('Search execution processing failed', {
        error: error.message,
        stack: error.stack,
        executionId
      });

      await this.handleExecutionError(executionId, error);
      throw error;
    }
  }

  /**
   * Gestisce errori di esecuzione
   * @param {string} executionId - ID dell'esecuzione
   * @param {Error} error - Errore occorso
   */
  async handleExecutionError(executionId, error) {
    try {
      const errorInfo = {
        message: error.message,
        type: error.constructor.name,
        timestamp: new Date(),
        recoverable: this._isRecoverableError(error)
      };

      await this.updateExecutionStatus(executionId, 'failed', {
        completed_at: new Date(),
        execution_errors: [errorInfo]
      });

      logger.error('Execution error handled', {
        executionId,
        error: errorInfo
      });

    } catch (updateError) {
      logger.error('Failed to handle execution error', {
        executionId,
        originalError: error.message,
        updateError: updateError.message
      });
    }
  }

  /**
   * Retry di un'esecuzione fallita
   * @param {string} executionId - ID dell'esecuzione
   * @param {Object} context - Contesto utente
   */
  async retryFailedExecution(executionId, context = {}) {
    try {
      const execution = await SearchExecution.findOne({
        where: {
          id: executionId,
          status: 'failed'
        },
        include: [{ model: SavedSearch, as: 'savedSearch' }]
      });

      if (!execution) {
        throw AppError.notFound('Failed execution not found');
      }

      // Reset status per retry
      await this.updateExecutionStatus(executionId, 'pending', {
        execution_errors: []
      });

      // Avvia nuovo tentativo
      return await this.processSearchExecution(
        executionId, 
        execution.savedSearch, 
        { ...context, tenant_id: execution.tenant_id }
      );

    } catch (error) {
      logger.error('Failed to retry execution', {
        error: error.message,
        executionId
      });
      throw error;
    }
  }

  /**
   * Aggiorna lo status di un'esecuzione
   * @param {string} executionId - ID dell'esecuzione
   * @param {string} status - Nuovo status
   * @param {Object} metadata - Metadata aggiuntivi
   */
  async updateExecutionStatus(executionId, status, metadata = {}) {
    try {
      const updateData = {
        status,
        updated_at: new Date(),
        ...metadata
      };

      await SearchExecution.update(updateData, {
        where: { id: executionId }
      });

      logger.debug('Execution status updated', {
        executionId,
        status,
        metadata
      });

    } catch (error) {
      logger.error('Failed to update execution status', {
        error: error.message,
        executionId,
        status
      });
      throw error;
    }
  }

  /**
   * Registra metriche di esecuzione
   * @param {string} executionId - ID dell'esecuzione
   * @param {Object} metrics - Metriche da registrare
   */
  async recordExecutionMetrics(executionId, metrics) {
    try {
      // Per ora salviamo nelle execution_errors come metadata
      // In futuro potremmo avere una tabella dedicata alle metriche
      const execution = await SearchExecution.findByPk(executionId);
      if (execution) {
        const currentErrors = execution.execution_errors || [];
        currentErrors.push({
          type: 'metrics',
          timestamp: new Date(),
          data: metrics
        });

        await execution.update({
          execution_errors: currentErrors
        });
      }

      logger.debug('Execution metrics recorded', {
        executionId,
        metrics
      });

    } catch (error) {
      logger.error('Failed to record execution metrics', {
        error: error.message,
        executionId,
        metrics
      });
      // Non rilanciamo l'errore per non bloccare il flusso principale
    }
  }

  /**
   * Finalizza un'esecuzione con i risultati
   * @param {string} executionId - ID dell'esecuzione
   * @param {Array} results - Array di risultati
   */
  async finalizeExecution(executionId, results) {
    try {
      const updateData = {
        status: 'completed',
        completed_at: new Date(),
        total_results_found: results.length,
        new_results_count: results.length // Per ora tutti sono nuovi
      };

      await SearchExecution.update(updateData, {
        where: { id: executionId }
      });

      // Aggiorna anche last_executed_at della SavedSearch
      const execution = await SearchExecution.findByPk(executionId);
      if (execution) {
        await SavedSearch.update({
          last_executed_at: new Date()
        }, {
          where: { id: execution.saved_search_id }
        });
      }

      logger.info('Execution finalized', {
        executionId,
        resultsCount: results.length
      });

    } catch (error) {
      logger.error('Failed to finalize execution', {
        error: error.message,
        executionId,
        resultsCount: results?.length
      });
      throw error;
    }
  }

  /**
   * Pre-processing della query (preparazione per future AI integration)
   * @param {string} naturalLanguageQuery - Query in linguaggio naturale
   * @returns {Object} Query pre-processata
   */
  async preprocessQuery(naturalLanguageQuery) {
    // Per ora solo cleanup basico, in futuro integrazione AI
    return {
      original: naturalLanguageQuery,
      cleaned: naturalLanguageQuery?.trim().toLowerCase(),
      language: 'it',
      complexity: this._estimateQueryComplexity(naturalLanguageQuery)
    };
  }

  /**
   * Valida criteri di ricerca strutturati
   * @param {Object} structuredCriteria - Criteri strutturati
   * @returns {Object} Risultato validazione
   */
  async validateSearchCriteria(structuredCriteria) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    try {
      // Validazione location
      if (structuredCriteria.location) {
        if (!structuredCriteria.location.city) {
          validation.warnings.push('Missing city in location criteria');
        }
      }

      // Validazione property
      if (structuredCriteria.property) {
        if (structuredCriteria.property.rooms) {
          const { min, max } = structuredCriteria.property.rooms;
          if (min && max && min > max) {
            validation.errors.push('Invalid room range: min > max');
            validation.valid = false;
          }
        }
      }

      // Validazione price
      if (structuredCriteria.price) {
        const { min, max } = structuredCriteria.price;
        if (min && max && min > max) {
          validation.errors.push('Invalid price range: min > max');
          validation.valid = false;
        }
      }

    } catch (error) {
      validation.valid = false;
      validation.errors.push(`Validation error: ${error.message}`);
    }

    return validation;
  }

  /**
   * Stima la complessità di esecuzione
   * @param {Object} criteria - Criteri di ricerca
   * @returns {string} Livello di complessità ('low', 'medium', 'high')
   */
  async estimateExecutionComplexity(criteria) {
    let complexity = 0;

    // Complessità basata sui filtri
    if (criteria.location?.areas?.length > 3) complexity += 2;
    if (criteria.property?.type === 'any') complexity += 1;
    if (criteria.filters?.platforms?.length > 2) complexity += 2;
    if (criteria.filters?.max_results > 100) complexity += 1;

    if (complexity <= 2) return 'low';
    if (complexity <= 4) return 'medium';
    return 'high';
  }

  /**
   * Utilities
   */
  _isRecoverableError(error) {
    const recoverableErrors = [
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
      'RATE_LIMITED'
    ];
    
    return recoverableErrors.some(recoverable => 
      error.message.includes(recoverable) || error.code === recoverable
    );
  }

  _estimateQueryComplexity(query) {
    if (!query) return 'low';
    
    const length = query.length;
    const words = query.split(' ').length;
    
    if (length > 100 || words > 15) return 'high';
    if (length > 50 || words > 8) return 'medium';
    return 'low';
  }
}

module.exports = SearchEngineService;
