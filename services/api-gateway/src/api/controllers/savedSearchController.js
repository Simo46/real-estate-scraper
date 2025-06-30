'use strict';

const { SavedSearch, SearchExecution, SearchResult, User, UserProfile, sequelize } = require('../../models');
const { AppError } = require('../../middleware/errorHandler');
const { validationResult } = require('express-validator');
const { createLogger } = require('../../utils/logger');
const logger = createLogger('controllers:savedSearch');
const { Op } = require('sequelize');
const SearchEngineService = require('../../services/searchEngineService');

/**
 * Controller per la gestione delle ricerche salvate
 * Gestisce criteri di ricerca, esecuzioni e tracking dei risultati
 */
class SavedSearchController {
  constructor() {
    // Initialize Search Engine Service
    this.searchEngineService = new SearchEngineService();
    // this.searchEngineService = null; // Lazy initialization
    
    // Bind di tutti i metodi per preservare il contesto this
    this.getSavedSearches = this.getSavedSearches.bind(this);
    this.getSavedSearchById = this.getSavedSearchById.bind(this);
    this.createSavedSearch = this.createSavedSearch.bind(this);
    this.updateSavedSearch = this.updateSavedSearch.bind(this);
    this.deleteSavedSearch = this.deleteSavedSearch.bind(this);
    this.executeSavedSearch = this.executeSavedSearch.bind(this);
    this.getExecutionHistory = this.getExecutionHistory.bind(this);
    this.toggleActive = this.toggleActive.bind(this);
    this.duplicateSavedSearch = this.duplicateSavedSearch.bind(this);
    this.getSearchStats = this.getSearchStats.bind(this);
  }

  _getSearchEngineService() {
    if (!this.searchEngineService) {
      const SearchEngineService = require('../../services/searchEngineService');
      this.searchEngineService = new SearchEngineService();
    }
    return this.searchEngineService;
  }

  /**
   * Ottiene la lista delle ricerche salvate dell'utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getSavedSearches(req, res, next) {
    try {
      const {
        page = 1,
        limit = 10,
        sort_by = 'updated_at',
        sort_dir = 'DESC',
        search,
        is_active,
        execution_frequency
      } = req.query;

      const offset = (page - 1) * limit;

      // Condizioni di ricerca base con tenant isolation
      const where = {
        tenant_id: req.tenantId,
        user_id: req.user.id // User può vedere solo le proprie ricerche
      };

      // Filtro per stato attivo/inattivo
      if (is_active === 'true' || is_active === 'false') {
        where.is_active = is_active === 'true';
      }

      // Filtro per frequenza di esecuzione
      if (execution_frequency) {
        where.execution_frequency = execution_frequency;
      }

      // Ricerca testuale su nome e query
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { natural_language_query: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Applica filtri da policy middleware se presenti
      if (req.queryOptions?.where) {
        Object.assign(where, req.queryOptions.where);
      }

      // Esegui query con paginazione e include delle esecuzioni recenti
      const { count, rows } = await SavedSearch.findAndCountAll({
        where,
        include: [
          {
            model: SearchExecution,
            as: 'executions',
            limit: 3,
            order: [['started_at', 'DESC']],
            attributes: ['id', 'execution_type', 'status', 'started_at', 'completed_at', 'new_results_count'],
            separate: true // Per evitare problemi con limit + include
          }
        ],
        offset: parseInt(offset),
        limit: parseInt(limit),
        order: [[sort_by, sort_dir.toUpperCase()]],
        distinct: true
      });

      // Calcola metadata di paginazione
      const totalPages = Math.ceil(count / limit);

      logger.info('Saved searches retrieved', {
        tenant_id: req.tenantId,
        user_id: req.user.id,
        count,
        page,
        filters: { is_active, execution_frequency }
      });

      res.json({
        status: 'success',
        data: {
          savedSearches: rows,
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
      logger.error('Error retrieving saved searches', {
        error: error.message,
        stack: error.stack,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Ottiene una ricerca salvata specifica per ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getSavedSearchById(req, res, next) {
    try {
      const { id } = req.params;

      const savedSearch = await SavedSearch.findOne({
        where: {
          id,
          tenant_id: req.tenantId,
          user_id: req.user.id
        },
        include: [
          {
            model: SearchExecution,
            as: 'executions',
            limit: 10,
            order: [['started_at', 'DESC']],
            include: [
              {
                model: SearchResult,
                as: 'results',
                limit: 5,
                order: [['relevance_score', 'DESC']],
                attributes: ['id', 'external_url', 'basic_title', 'basic_price', 'relevance_score', 'ai_summary']
              }
            ]
          },
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'username'],
            include: [
              {
                model: UserProfile,
                as: 'profile',
                attributes: ['search_preferences']
              }
            ]
          }
        ]
      });

      if (!savedSearch) {
        throw AppError.notFound('Saved search not found');
      }

      // Il field filtering è gestito dal policy middleware
      logger.info('Saved search retrieved', {
        savedSearchId: id,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { savedSearch }
      });

    } catch (error) {
      logger.error('Error retrieving saved search by ID', {
        error: error.message,
        savedSearchId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Crea una nuova ricerca salvata
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async createSavedSearch(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        name,
        natural_language_query,
        structured_criteria,
        execution_frequency = 'manual',
        notify_on_new_results = false
      } = req.body;

      // Verifica che l'utente non abbia già una ricerca con lo stesso nome
      const existingSearch = await SavedSearch.findOne({
        where: {
          name,
          user_id: req.user.id,
          tenant_id: req.tenantId
        }
      });

      if (existingSearch) {
        throw AppError.validation('A saved search with this name already exists');
      }

      // Crea la ricerca salvata
      const savedSearch = await SavedSearch.create({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        name,
        natural_language_query,
        structured_criteria,
        execution_frequency,
        notify_on_new_results,
        is_active: true,
        created_by: req.user.id,
        updated_by: req.user.id
      }, { transaction });

      await transaction.commit();

      logger.info('Saved search created', {
        savedSearchId: savedSearch.id,
        name,
        execution_frequency,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.status(201).json({
        status: 'success',
        data: { savedSearch }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating saved search', {
        error: error.message,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Aggiorna una ricerca salvata esistente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async updateSavedSearch(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const {
        name,
        natural_language_query,
        structured_criteria,
        execution_frequency,
        notify_on_new_results,
        is_active
      } = req.body;

      // Il policy middleware ha già verificato i permessi e caricato la risorsa
      const savedSearch = req.resource;

      // Se il nome è cambiato, verifica unicità
      if (name && name !== savedSearch.name) {
        const existingSearch = await SavedSearch.findOne({
          where: {
            name,
            user_id: req.user.id,
            tenant_id: req.tenantId,
            id: { [Op.ne]: id }
          }
        });

        if (existingSearch) {
          throw AppError.validation('A saved search with this name already exists');
        }
      }

      // Aggiorna i campi forniti
      const updateData = {
        updated_by: req.user.id
      };

      if (name !== undefined) updateData.name = name;
      if (natural_language_query !== undefined) updateData.natural_language_query = natural_language_query;
      if (structured_criteria !== undefined) updateData.structured_criteria = structured_criteria;
      if (execution_frequency !== undefined) updateData.execution_frequency = execution_frequency;
      if (notify_on_new_results !== undefined) updateData.notify_on_new_results = notify_on_new_results;
      if (is_active !== undefined) updateData.is_active = is_active;

      await savedSearch.update(updateData, { transaction });

      await transaction.commit();

      logger.info('Saved search updated', {
        savedSearchId: id,
        updates: Object.keys(updateData),
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { savedSearch }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error updating saved search', {
        error: error.message,
        savedSearchId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Elimina una ricerca salvata (soft delete)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async deleteSavedSearch(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;

      // Il policy middleware ha già verificato i permessi e caricato la risorsa
      const savedSearch = req.resource;

      // Disattiva prima tutte le esecuzioni automatiche correlate
      await SearchExecution.update(
        { status: 'cancelled' },
        {
          where: {
            saved_search_id: id,
            status: 'pending'
          },
          transaction
        }
      );

      await savedSearch.destroy({ transaction });

      await transaction.commit();

      logger.info('Saved search deleted', {
        savedSearchId: id,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        message: 'Saved search deleted successfully'
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error deleting saved search', {
        error: error.message,
        savedSearchId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Esegue una ricerca salvata (crea una nuova SearchExecution)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async executeSavedSearch(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { execution_type = 'manual' } = req.body;

      const savedSearch = await SavedSearch.findOne({
        where: {
          id,
          tenant_id: req.tenantId,
          user_id: req.user.id,
          is_active: true
        }
      });

      if (!savedSearch) {
        throw AppError.notFound('Active saved search not found');
      }

      // Crea una nuova esecuzione
      const searchExecution = await SearchExecution.create({
        tenant_id: req.tenantId,
        saved_search_id: id,
        execution_type,
        status: 'pending',
        started_at: new Date(),
        platforms_searched: [], // Sarà aggiornato dal scraping service
        created_by: req.user.id,
        updated_by: req.user.id
      }, { transaction });

      // Aggiorna timestamp ultima esecuzione
      await savedSearch.update({
        last_executed_at: new Date(),
        updated_by: req.user.id
      }, { transaction });

      await transaction.commit();

      // Invoke Search Engine Service for asynchronous processing  
      try {
        const context = {
          tenant_id: req.tenantId,
          user_id: req.user.id
        };
        
        // Il SearchEngineService creerà la propria SearchExecution, quindi cancelliamo quella creata qui
        await SearchExecution.destroy({
          where: { id: searchExecution.id }
        });
        
        const newExecution = await this.searchEngineService.executeSearch(id, execution_type, context);
        
        logger.info('Search engine service invoked successfully', {
          savedSearchId: id,
          executionId: newExecution.id
        });
        
        // Aggiorna la response con la nuova execution
        searchExecution = newExecution;
        
      } catch (serviceError) {
        logger.error('Error invoking search engine service', {
          error: serviceError.message,
          savedSearchId: id,
          executionId: searchExecution.id
        });
        
        // Se il servizio fallisce, manteniamo l'execution originale e aggiorniamo lo status
        await SearchExecution.update({
          status: 'failed',
          execution_metadata: {
            error_message: serviceError.message,
            failed_at: new Date()
          }
        }, {
          where: { id: searchExecution.id }
        });
      }

      logger.info('Saved search execution started', {
        savedSearchId: id,
        executionId: searchExecution.id,
        execution_type,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.status(202).json({
        status: 'success',
        data: { 
          searchExecution,
          message: 'Search execution started. Results will be available soon.'
        }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error executing saved search', {
        error: error.message,
        savedSearchId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Ottiene lo storico delle esecuzioni per una ricerca salvata
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getExecutionHistory(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      // Verifica che la ricerca salvata appartenga all'utente
      const savedSearch = await SavedSearch.findOne({
        where: {
          id,
          tenant_id: req.tenantId,
          user_id: req.user.id
        }
      });

      if (!savedSearch) {
        throw AppError.notFound('Saved search not found');
      }

      const { count, rows } = await SearchExecution.findAndCountAll({
        where: {
          saved_search_id: id,
          tenant_id: req.tenantId
        },
        include: [
          {
            model: SearchResult,
            as: 'results',
            attributes: ['id', 'source_platform', 'relevance_score'],
            limit: 3,
            order: [['relevance_score', 'DESC']],
            separate: true
          }
        ],
        offset: parseInt(offset),
        limit: parseInt(limit),
        order: [['started_at', 'DESC']]
      });

      const totalPages = Math.ceil(count / limit);

      logger.info('Execution history retrieved', {
        savedSearchId: id,
        executionCount: count,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: {
          executions: rows,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: count,
            itemsPerPage: parseInt(limit)
          }
        }
      });

    } catch (error) {
      logger.error('Error retrieving execution history', {
        error: error.message,
        savedSearchId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Attiva/Disattiva una ricerca salvata
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async toggleActive(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;

      const savedSearch = await SavedSearch.findOne({
        where: {
          id,
          tenant_id: req.tenantId,
          user_id: req.user.id
        }
      });

      if (!savedSearch) {
        throw AppError.notFound('Saved search not found');
      }

      await savedSearch.update({
        is_active: !savedSearch.is_active,
        updated_by: req.user.id
      }, { transaction });

      await transaction.commit();

      logger.info('Saved search status toggled', {
        savedSearchId: id,
        newStatus: savedSearch.is_active,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { 
          savedSearch,
          message: `Saved search ${savedSearch.is_active ? 'activated' : 'deactivated'}`
        }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error toggling saved search status', {
        error: error.message,
        savedSearchId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Duplica una ricerca salvata esistente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async duplicateSavedSearch(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { name } = req.body;

      const originalSearch = await SavedSearch.findOne({
        where: {
          id,
          tenant_id: req.tenantId,
          user_id: req.user.id
        }
      });

      if (!originalSearch) {
        throw AppError.notFound('Saved search not found');
      }

      // Verifica unicità del nuovo nome
      const duplicateName = name || `${originalSearch.name} (Copy)`;
      const existingSearch = await SavedSearch.findOne({
        where: {
          name: duplicateName,
          user_id: req.user.id,
          tenant_id: req.tenantId
        }
      });

      if (existingSearch) {
        throw AppError.validation('A saved search with this name already exists');
      }

      // Crea la duplicata
      const duplicatedSearch = await SavedSearch.create({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        name: duplicateName,
        natural_language_query: originalSearch.natural_language_query,
        structured_criteria: originalSearch.structured_criteria,
        execution_frequency: 'manual', // Reset a manual per safety
        notify_on_new_results: false, // Reset notifiche
        is_active: true,
        created_by: req.user.id,
        updated_by: req.user.id
      }, { transaction });

      await transaction.commit();

      logger.info('Saved search duplicated', {
        originalId: id,
        duplicatedId: duplicatedSearch.id,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.status(201).json({
        status: 'success',
        data: { savedSearch: duplicatedSearch }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error duplicating saved search', {
        error: error.message,
        savedSearchId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Ottiene statistiche delle ricerche salvate dell'utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getSearchStats(req, res, next) {
    try {
      const stats = await SavedSearch.findAll({
        where: {
          tenant_id: req.tenantId,
          user_id: req.user.id
        },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'total_searches'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN is_active = true THEN 1 END')), 'active_searches'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN execution_frequency != \'manual\' THEN 1 END')), 'automated_searches']
        ],
        raw: true
      });

      const recentExecutions = await SearchExecution.count({
        include: [
          {
            model: SavedSearch,
            as: 'savedSearch',
            where: {
              user_id: req.user.id,
              tenant_id: req.tenantId
            }
          }
        ],
        where: {
          started_at: {
            [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Ultimi 30 giorni
          }
        }
      });

      logger.info('Search stats retrieved', {
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: {
          stats: {
            ...stats[0],
            recent_executions: recentExecutions
          }
        }
      });

    } catch (error) {
      logger.error('Error retrieving search stats', {
        error: error.message,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }
}

module.exports = new SavedSearchController();