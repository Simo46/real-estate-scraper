'use strict';

const { SearchExecution, SavedSearch, SearchResult, User, sequelize } = require('../../models');
const { AppError } = require('../../middleware/errorHandler');
const { validationResult } = require('express-validator');
const { createLogger } = require('../../utils/logger');
const logger = createLogger('controllers:searchExecution');
const { Op } = require('sequelize');
const SearchEngineService = require('../../services/searchEngineService');

/**
 * Controller per la gestione delle esecuzioni di ricerca
 * Gestisce il tracking delle ricerche real-time e il loro stato
 */
class SearchExecutionController {
  constructor() {
    // Initialize Search Engine Service
    this.searchEngineService = new SearchEngineService();
    
    // Bind di tutti i metodi per preservare il contesto this
    this.getSearchExecutions = this.getSearchExecutions.bind(this);
    this.getSearchExecutionById = this.getSearchExecutionById.bind(this);
    this.createSearchExecution = this.createSearchExecution.bind(this);
    this.updateExecutionStatus = this.updateExecutionStatus.bind(this);
    this.cancelExecution = this.cancelExecution.bind(this);
    this.getExecutionResults = this.getExecutionResults.bind(this);
    this.getExecutionStats = this.getExecutionStats.bind(this);
    this.retryFailedExecution = this.retryFailedExecution.bind(this);
    this.getActiveExecutions = this.getActiveExecutions.bind(this);
    this.getExecutionLogs = this.getExecutionLogs.bind(this);
  }

  /**
   * Ottiene la lista delle esecuzioni di ricerca con filtri
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getSearchExecutions(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        sort_by = 'started_at',
        sort_dir = 'DESC',
        status,
        execution_type,
        saved_search_id,
        date_from,
        date_to
      } = req.query;

      const offset = (page - 1) * limit;

      // Condizioni di ricerca base con tenant isolation
      const where = {
        tenant_id: req.tenantId
      };

      // Filtro per saved_search_id (solo ricerche dell'utente)
      if (saved_search_id) {
        // Verifica che la saved search appartenga all'utente
        const savedSearch = await SavedSearch.findOne({
          where: {
            id: saved_search_id,
            user_id: req.user.id,
            tenant_id: req.tenantId
          }
        });

        if (!savedSearch) {
          throw AppError.notFound('Saved search not found');
        }

        where.saved_search_id = saved_search_id;
      } else {
        // Se non specificato saved_search_id, mostra solo le esecuzioni dell'utente
        where['$savedSearch.user_id$'] = req.user.id;
      }

      // Filtro per status
      if (status) {
        where.status = status;
      }

      // Filtro per tipo di esecuzione
      if (execution_type) {
        where.execution_type = execution_type;
      }

      // Filtri data
      if (date_from || date_to) {
        where.started_at = {};
        if (date_from) where.started_at[Op.gte] = new Date(date_from);
        if (date_to) where.started_at[Op.lte] = new Date(date_to);
      }

      // Applica filtri da policy middleware se presenti
      if (req.queryOptions?.where) {
        Object.assign(where, req.queryOptions.where);
      }

      // Esegui query con include delle relazioni
      const { count, rows } = await SearchExecution.findAndCountAll({
        where,
        include: [
          {
            model: SavedSearch,
            as: 'savedSearch',
            attributes: ['id', 'name', 'natural_language_query', 'user_id'],
            include: [
              {
                model: User,
                as: 'user',
                attributes: ['id', 'name', 'username']
              }
            ]
          },
          {
            model: SearchResult,
            as: 'results',
            attributes: ['id', 'source_platform', 'relevance_score'],
            limit: 5,
            order: [['relevance_score', 'DESC']],
            separate: true
          }
        ],
        offset: parseInt(offset),
        limit: parseInt(limit),
        order: [[sort_by, sort_dir.toUpperCase()]],
        distinct: true
      });

      // Calcola metadata di paginazione
      const totalPages = Math.ceil(count / limit);

      logger.info('Search executions retrieved', {
        tenant_id: req.tenantId,
        user_id: req.user.id,
        count,
        page,
        filters: { status, execution_type, saved_search_id }
      });

      res.json({
        status: 'success',
        data: {
          searchExecutions: rows,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: count,
            itemsPerPage: parseInt(limit),
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          }
        }
      });

    } catch (error) {
      logger.error('Error retrieving search executions', {
        error: error.message,
        stack: error.stack,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Ottiene un'esecuzione di ricerca specifica per ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getSearchExecutionById(req, res, next) {
    try {
      const { id } = req.params;

      const searchExecution = await SearchExecution.findOne({
        where: {
          id,
          tenant_id: req.tenantId
        },
        include: [
          {
            model: SavedSearch,
            as: 'savedSearch',
            include: [
              {
                model: User,
                as: 'user',
                attributes: ['id', 'name', 'username']
              }
            ]
          },
          {
            model: SearchResult,
            as: 'results',
            order: [['relevance_score', 'DESC']]
          }
        ]
      });

      if (!searchExecution) {
        throw AppError.notFound('Search execution not found');
      }

      // Verifica che l'utente possa accedere a questa esecuzione
      if (searchExecution.savedSearch.user_id !== req.user.id) {
        throw AppError.forbidden('Access denied to this search execution');
      }

      logger.info('Search execution retrieved', {
        searchExecutionId: id,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { searchExecution }
      });

    } catch (error) {
      logger.error('Error retrieving search execution by ID', {
        error: error.message,
        searchExecutionId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Crea una nuova esecuzione di ricerca
   * Tipicamente chiamato dal sistema di scheduling o manualmente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async createSearchExecution(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        saved_search_id,
        execution_type = 'manual',
        platforms_searched = [],
        priority = 'normal'
      } = req.body;

      // Verifica che la saved search esista e appartenga all'utente
      const savedSearch = await SavedSearch.findOne({
        where: {
          id: saved_search_id,
          tenant_id: req.tenantId,
          user_id: req.user.id,
          is_active: true
        }
      });

      if (!savedSearch) {
        throw AppError.notFound('Active saved search not found');
      }

      // Verifica che non ci sia già un'esecuzione in corso per questa ricerca
      const activeExecution = await SearchExecution.findOne({
        where: {
          saved_search_id,
          status: ['pending', 'running'],
          tenant_id: req.tenantId
        }
      });

      if (activeExecution) {
        throw AppError.validation('There is already an active execution for this saved search');
      }

      // Crea la nuova esecuzione
      const searchExecution = await SearchExecution.create({
        tenant_id: req.tenantId,
        saved_search_id,
        execution_type,
        status: 'pending',
        started_at: new Date(),
        platforms_searched,
        total_results_found: 0,
        new_results_count: 0,
        execution_errors: [],
        priority,
        created_by: req.user.id,
        updated_by: req.user.id
      }, { transaction });

      // Aggiorna timestamp ultima esecuzione nella saved search
      await savedSearch.update({
        last_executed_at: new Date(),
        updated_by: req.user.id
      }, { transaction });

      await transaction.commit();

      // TODO: Qui dovrebbe essere invocato il scraping service
      // per iniziare l'elaborazione asincrona della ricerca

      logger.info('Search execution created', {
        searchExecutionId: searchExecution.id,
        saved_search_id,
        execution_type,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.status(201).json({
        status: 'success',
        data: { 
          searchExecution,
          message: 'Search execution created and queued for processing'
        }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating search execution', {
        error: error.message,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Aggiorna lo status di un'esecuzione di ricerca
   * Tipicamente chiamato dal scraping service durante l'elaborazione
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async updateExecutionStatus(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const {
        status,
        platforms_searched,
        total_results_found,
        new_results_count,
        execution_errors,
        completed_at
      } = req.body;

      const searchExecution = await SearchExecution.findOne({
        where: {
          id,
          tenant_id: req.tenantId
        }
      });

      if (!searchExecution) {
        throw AppError.notFound('Search execution not found');
      }

      // Prepara i dati per l'aggiornamento
      const updateData = {
        updated_by: req.user.id
      };

      if (status !== undefined) updateData.status = status;
      if (platforms_searched !== undefined) updateData.platforms_searched = platforms_searched;
      if (total_results_found !== undefined) updateData.total_results_found = total_results_found;
      if (new_results_count !== undefined) updateData.new_results_count = new_results_count;
      if (execution_errors !== undefined) updateData.execution_errors = execution_errors;
      if (completed_at !== undefined) updateData.completed_at = new Date(completed_at);

      // Se l'esecuzione è completata/fallita e non ha completed_at, impostalo
      if (['completed', 'failed', 'cancelled'].includes(status) && !updateData.completed_at) {
        updateData.completed_at = new Date();
      }

      await searchExecution.update(updateData, { transaction });

      await transaction.commit();

      logger.info('Search execution status updated', {
        searchExecutionId: id,
        newStatus: status,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { searchExecution }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error updating search execution status', {
        error: error.message,
        searchExecutionId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Cancella un'esecuzione di ricerca in corso
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async cancelExecution(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;

      const searchExecution = await SearchExecution.findOne({
        where: {
          id,
          tenant_id: req.tenantId
        },
        include: [
          {
            model: SavedSearch,
            as: 'savedSearch',
            attributes: ['user_id']
          }
        ]
      });

      if (!searchExecution) {
        throw AppError.notFound('Search execution not found');
      }

      // Verifica che l'utente possa cancellare questa esecuzione
      if (searchExecution.savedSearch.user_id !== req.user.id) {
        throw AppError.forbidden('Access denied to cancel this execution');
      }

      // Verifica che l'esecuzione possa essere cancellata
      if (!['pending', 'running'].includes(searchExecution.status)) {
        throw AppError.validation('Cannot cancel execution in current status');
      }

      await searchExecution.update({
        status: 'cancelled',
        completed_at: new Date(),
        updated_by: req.user.id
      }, { transaction });

      await transaction.commit();

      // TODO: Qui dovrebbe essere notificato il scraping service
      // per interrompere l'elaborazione se in corso

      logger.info('Search execution cancelled', {
        searchExecutionId: id,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { 
          searchExecution,
          message: 'Search execution cancelled successfully'
        }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error cancelling search execution', {
        error: error.message,
        searchExecutionId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Ottiene i risultati di un'esecuzione specifica
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getExecutionResults(req, res, next) {
    try {
      const { id } = req.params;
      const {
        page = 1,
        limit = 20,
        sort_by = 'relevance_score',
        sort_dir = 'DESC',
        source_platform,
        min_relevance_score = 0
      } = req.query;

      const offset = (page - 1) * limit;

      // Verifica che l'esecuzione esista e appartenga all'utente
      const searchExecution = await SearchExecution.findOne({
        where: {
          id,
          tenant_id: req.tenantId
        },
        include: [
          {
            model: SavedSearch,
            as: 'savedSearch',
            attributes: ['user_id']
          }
        ]
      });

      if (!searchExecution) {
        throw AppError.notFound('Search execution not found');
      }

      if (searchExecution.savedSearch.user_id !== req.user.id) {
        throw AppError.forbidden('Access denied to this execution results');
      }

      // Costruisci condizioni per i risultati
      const where = {
        execution_id: id,
        tenant_id: req.tenantId,
        relevance_score: { [Op.gte]: parseFloat(min_relevance_score) }
      };

      if (source_platform) {
        where.source_platform = source_platform;
      }

      const { count, rows } = await SearchResult.findAndCountAll({
        where,
        offset: parseInt(offset),
        limit: parseInt(limit),
        order: [[sort_by, sort_dir.toUpperCase()]]
      });

      const totalPages = Math.ceil(count / limit);

      logger.info('Execution results retrieved', {
        searchExecutionId: id,
        resultsCount: count,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: {
          execution: {
            id: searchExecution.id,
            status: searchExecution.status,
            total_results_found: searchExecution.total_results_found,
            platforms_searched: searchExecution.platforms_searched
          },
          results: rows,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: count,
            itemsPerPage: parseInt(limit)
          }
        }
      });

    } catch (error) {
      logger.error('Error retrieving execution results', {
        error: error.message,
        searchExecutionId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Ottiene statistiche delle esecuzioni dell'utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getExecutionStats(req, res, next) {
    try {
      const { days = 30 } = req.query;
      const dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const stats = await SearchExecution.findAll({
        where: {
          tenant_id: req.tenantId,
          started_at: { [Op.gte]: dateThreshold }
        },
        include: [
          {
            model: SavedSearch,
            as: 'savedSearch',
            where: { user_id: req.user.id },
            attributes: []
          }
        ],
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('SearchExecution.id')), 'total_executions'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN status = \'completed\' THEN 1 END')), 'completed_executions'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN status = \'failed\' THEN 1 END')), 'failed_executions'],
          [sequelize.fn('AVG', sequelize.col('total_results_found')), 'avg_results_per_execution'],
          [sequelize.fn('SUM', sequelize.col('total_results_found')), 'total_results_found']
        ],
        raw: true
      });

      // Statistiche per piattaforma
      const platformStats = await SearchResult.findAll({
        where: {
          tenant_id: req.tenantId,
          created_at: { [Op.gte]: dateThreshold }
        },
        include: [
          {
            model: SearchExecution,
            as: 'execution',
            include: [
              {
                model: SavedSearch,
                as: 'savedSearch',
                where: { user_id: req.user.id },
                attributes: []
              }
            ],
            attributes: []
          }
        ],
        attributes: [
          'source_platform',
          [sequelize.fn('COUNT', sequelize.col('SearchResult.id')), 'results_count'],
          [sequelize.fn('AVG', sequelize.col('relevance_score')), 'avg_relevance_score']
        ],
        group: ['source_platform'],
        raw: true
      });

      logger.info('Execution stats retrieved', {
        days,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: {
          period_days: parseInt(days),
          overall_stats: stats[0],
          platform_stats: platformStats
        }
      });

    } catch (error) {
      logger.error('Error retrieving execution stats', {
        error: error.message,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Riprova un'esecuzione fallita
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async retryFailedExecution(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;

      const failedExecution = await SearchExecution.findOne({
        where: {
          id,
          tenant_id: req.tenantId,
          status: 'failed'
        },
        include: [
          {
            model: SavedSearch,
            as: 'savedSearch',
            attributes: ['user_id', 'is_active']
          }
        ]
      });

      if (!failedExecution) {
        throw AppError.notFound('Failed search execution not found');
      }

      if (failedExecution.savedSearch.user_id !== req.user.id) {
        throw AppError.forbidden('Access denied to retry this execution');
      }

      if (!failedExecution.savedSearch.is_active) {
        throw AppError.validation('Cannot retry execution for inactive saved search');
      }

      // Crea una nuova esecuzione basata su quella fallita
      const retryExecution = await SearchExecution.create({
        tenant_id: req.tenantId,
        saved_search_id: failedExecution.saved_search_id,
        execution_type: 'retry',
        status: 'pending',
        started_at: new Date(),
        platforms_searched: failedExecution.platforms_searched,
        total_results_found: 0,
        new_results_count: 0,
        execution_errors: [],
        retry_of_execution_id: id,
        created_by: req.user.id,
        updated_by: req.user.id
      }, { transaction });

      await transaction.commit();

      // Invoke Search Engine Service for retry processing
      try {
        const context = {
          tenant_id: req.tenantId,
          user_id: req.user.id
        };
        
        // Delete the created execution since SearchEngineService will create its own
        await SearchExecution.destroy({
          where: { id: retryExecution.id }
        });
        
        const newExecution = await this.searchEngineService.executeSearch(
          failedExecution.saved_search_id, 
          'retry', 
          context
        );
        
        logger.info('Search engine service invoked for retry', {
          originalExecutionId: id,
          newExecutionId: newExecution.id
        });
        
        // Update response with new execution
        retryExecution.id = newExecution.id;
        
      } catch (serviceError) {
        logger.error('Error invoking search engine service for retry', {
          error: serviceError.message,
          originalExecutionId: id,
          retryExecutionId: retryExecution.id
        });
        
        // If service fails, update retry execution status
        await SearchExecution.update({
          status: 'failed',
          execution_metadata: {
            error_message: serviceError.message,
            failed_at: new Date()
          }
        }, {
          where: { id: retryExecution.id }
        });
      }

      logger.info('Search execution retry created', {
        originalExecutionId: id,
        retryExecutionId: retryExecution.id,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.status(201).json({
        status: 'success',
        data: { 
          searchExecution: retryExecution,
          message: 'Retry execution created and queued for processing'
        }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error retrying search execution', {
        error: error.message,
        searchExecutionId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Ottiene le esecuzioni attualmente attive (pending/running)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getActiveExecutions(req, res, next) {
    try {
      const activeExecutions = await SearchExecution.findAll({
        where: {
          tenant_id: req.tenantId,
          status: ['pending', 'running']
        },
        include: [
          {
            model: SavedSearch,
            as: 'savedSearch',
            where: { user_id: req.user.id },
            attributes: ['id', 'name']
          }
        ],
        order: [['started_at', 'ASC']]
      });

      logger.info('Active executions retrieved', {
        count: activeExecutions.length,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { activeExecutions }
      });

    } catch (error) {
      logger.error('Error retrieving active executions', {
        error: error.message,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Ottiene i log di errore di un'esecuzione
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getExecutionLogs(req, res, next) {
    try {
      const { id } = req.params;

      const searchExecution = await SearchExecution.findOne({
        where: {
          id,
          tenant_id: req.tenantId
        },
        include: [
          {
            model: SavedSearch,
            as: 'savedSearch',
            where: { user_id: req.user.id },
            attributes: ['id', 'name']
          }
        ],
        attributes: ['id', 'status', 'execution_errors', 'started_at', 'completed_at']
      });

      if (!searchExecution) {
        throw AppError.notFound('Search execution not found or access denied');
      }

      logger.info('Execution logs retrieved', {
        searchExecutionId: id,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { 
          execution: searchExecution,
          logs: searchExecution.execution_errors || []
        }
      });

    } catch (error) {
      logger.error('Error retrieving execution logs', {
        error: error.message,
        searchExecutionId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }
}

module.exports = new SearchExecutionController();