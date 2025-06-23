'use strict';

const { SearchResult, SavedSearch, SearchExecution, sequelize } = require('../../models');
const { AppError } = require('../../middleware/errorHandler');
const { validationResult } = require('express-validator');
const { createLogger } = require('../../utils/logger');
const logger = createLogger('controllers:searchResult');
const { Op } = require('sequelize');

/**
 * Controller per la gestione dei risultati di ricerca
 * Gestisce solo metadata + AI analysis (NO contenuti originali per compliance ToS)
 */
class SearchResultController {
  constructor() {
    // Bind di tutti i metodi per preservare il contesto this
    this.getSearchResults = this.getSearchResults.bind(this);
    this.getSearchResultById = this.getSearchResultById.bind(this);
    this.createSearchResult = this.createSearchResult.bind(this);
    this.updateAIAnalysis = this.updateAIAnalysis.bind(this);
    this.deleteSearchResult = this.deleteSearchResult.bind(this);
    this.getByExecutionId = this.getByExecutionId.bind(this);
    this.markAsViewed = this.markAsViewed.bind(this);
    this.getTopResults = this.getTopResults.bind(this);
  }

  /**
   * Ottiene la lista dei risultati di ricerca con filtri avanzati
   * @param {Object} req - Request object
   * @param {Object} res - Response object  
   * @param {Function} next - Next middleware
   */
  async getSearchResults(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        sort_by = 'relevance_score',
        sort_dir = 'DESC',
        search,
        source_platform,
        min_price,
        max_price,
        basic_location,
        min_relevance_score = 0.3,
        execution_id
      } = req.query;

      const offset = (page - 1) * limit;

      // Condizioni di ricerca base con tenant isolation
      const where = {
        tenant_id: req.tenantId
      };

      // Filtro per execution_id (per vedere risultati di una specifica ricerca)
      if (execution_id) {
        where.execution_id = execution_id;
      }

      // Filtro per piattaforma sorgente
      if (source_platform) {
        where.source_platform = source_platform;
      }

      // Filtri di prezzo
      if (min_price || max_price) {
        where.basic_price = {};
        if (min_price) where.basic_price[Op.gte] = parseFloat(min_price);
        if (max_price) where.basic_price[Op.lte] = parseFloat(max_price);
      }

      // Filtro per località
      if (basic_location) {
        where.basic_location = { [Op.iLike]: `%${basic_location}%` };
      }

      // Filtro per relevance score minimo
      where.relevance_score = { [Op.gte]: parseFloat(min_relevance_score) };

      // Ricerca testuale su titolo e AI insights
      if (search) {
        where[Op.or] = [
          { basic_title: { [Op.iLike]: `%${search}%` } },
          { 'ai_insights.summary': { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Applica filtri da policy middleware se presenti
      if (req.queryOptions?.where) {
        Object.assign(where, req.queryOptions.where);
      }

      // Esegui query con paginazione e sorting
      const { count, rows } = await SearchResult.findAndCountAll({
        where,
        include: [
          {
            model: SearchExecution,
            as: 'execution',
            attributes: ['id', 'execution_type', 'status', 'started_at']
          }
        ],
        offset: parseInt(offset),
        limit: parseInt(limit),
        order: [[sort_by, sort_dir.toUpperCase()]],
        distinct: true
      });

      // Calcola metadata di paginazione
      const totalPages = Math.ceil(count / limit);
      
      logger.info('Search results retrieved', {
        tenant_id: req.tenantId,
        user_id: req.user.id,
        count,
        page,
        filters: { source_platform, basic_location, min_relevance_score }
      });

      res.json({
        status: 'success',
        data: {
          searchResults: rows,
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
      logger.error('Error retrieving search results', {
        error: error.message,
        stack: error.stack,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Ottiene un risultato di ricerca specifico per ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getSearchResultById(req, res, next) {
    try {
      const { id } = req.params;

      const searchResult = await SearchResult.findOne({
        where: {
          id,
          tenant_id: req.tenantId
        },
        include: [
          {
            model: SearchExecution,
            as: 'execution',
            include: [
              {
                model: SavedSearch,
                as: 'savedSearch',
                attributes: ['id', 'name', 'natural_language_query']
              }
            ]
          }
        ]
      });

      if (!searchResult) {
        throw AppError.notFound('Search result not found');
      }

      // Il field filtering è gestito dal policy middleware
      logger.info('Search result retrieved', {
        searchResultId: id,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { searchResult }
      });

    } catch (error) {
      logger.error('Error retrieving search result by ID', {
        error: error.message,
        searchResultId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Crea un nuovo risultato di ricerca (solo metadata + AI analysis)
   * Utilizzato dal scraping service per salvare risultati processati
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async createSearchResult(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        execution_id,
        external_url,
        source_platform,
        basic_title,
        basic_price,
        basic_location,
        relevance_score,
        ai_insights,
        ai_summary,
        ai_recommendation
      } = req.body;

      // Verifica che l'execution esista e appartenga al tenant
      const execution = await SearchExecution.findOne({
        where: {
          id: execution_id,
          tenant_id: req.tenantId
        }
      });

      if (!execution) {
        throw AppError.notFound('Search execution not found');
      }

      // Crea il risultato di ricerca
      const searchResult = await SearchResult.create({
        tenant_id: req.tenantId,
        execution_id,
        external_url,
        source_platform,
        basic_title,
        basic_price,
        basic_location,
        relevance_score,
        ai_insights,
        ai_summary,
        ai_recommendation,
        created_by: req.user.id,
        updated_by: req.user.id
      }, { transaction });

      await transaction.commit();

      logger.info('Search result created', {
        searchResultId: searchResult.id,
        execution_id,
        source_platform,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.status(201).json({
        status: 'success',
        data: { searchResult }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error creating search result', {
        error: error.message,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Aggiorna l'analisi AI di un risultato di ricerca
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async updateAIAnalysis(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { ai_insights, ai_summary, ai_recommendation, relevance_score } = req.body;

      // Il policy middleware ha già verificato i permessi e caricato la risorsa
      const searchResult = req.resource;

      await searchResult.update({
        ai_insights,
        ai_summary,
        ai_recommendation,
        relevance_score,
        updated_by: req.user.id
      }, { transaction });

      await transaction.commit();

      logger.info('Search result AI analysis updated', {
        searchResultId: id,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { searchResult }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error updating search result AI analysis', {
        error: error.message,
        searchResultId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Elimina un risultato di ricerca (soft delete)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async deleteSearchResult(req, res, next) {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;

      // Il policy middleware ha già verificato i permessi e caricato la risorsa
      const searchResult = req.resource;

      await searchResult.destroy({ transaction });

      await transaction.commit();

      logger.info('Search result deleted', {
        searchResultId: id,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        message: 'Search result deleted successfully'
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Error deleting search result', {
        error: error.message,
        searchResultId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Ottiene tutti i risultati per un'esecuzione specifica
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getByExecutionId(req, res, next) {
    try {
      const { executionId } = req.params;
      const { limit = 50, sort_by = 'relevance_score', sort_dir = 'DESC' } = req.query;

      const searchResults = await SearchResult.findAll({
        where: {
          execution_id: executionId,
          tenant_id: req.tenantId
        },
        limit: parseInt(limit),
        order: [[sort_by, sort_dir.toUpperCase()]]
      });

      logger.info('Search results retrieved by execution ID', {
        executionId,
        count: searchResults.length,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { searchResults }
      });

    } catch (error) {
      logger.error('Error retrieving search results by execution ID', {
        error: error.message,
        executionId: req.params.executionId,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Marca un risultato come visualizzato dall'utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async markAsViewed(req, res, next) {
    try {
      const { id } = req.params;

      const searchResult = await SearchResult.findOne({
        where: {
          id,
          tenant_id: req.tenantId
        }
      });

      if (!searchResult) {
        throw AppError.notFound('Search result not found');
      }

      // Aggiorna metrica di visualizzazione (se implementata)
      await searchResult.update({
        viewed_at: new Date(),
        viewed_by: req.user.id
      });

      logger.info('Search result marked as viewed', {
        searchResultId: id,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        message: 'Search result marked as viewed'
      });

    } catch (error) {
      logger.error('Error marking search result as viewed', {
        error: error.message,
        searchResultId: req.params.id,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }

  /**
   * Ottiene i migliori risultati per l'utente (alta rilevanza)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getTopResults(req, res, next) {
    try {
      const { limit = 10, days = 7 } = req.query;
      const dateThreshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const topResults = await SearchResult.findAll({
        where: {
          tenant_id: req.tenantId,
          relevance_score: { [Op.gte]: 0.8 },
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
                attributes: ['id', 'name']
              }
            ]
          }
        ],
        limit: parseInt(limit),
        order: [['relevance_score', 'DESC'], ['created_at', 'DESC']]
      });

      logger.info('Top search results retrieved', {
        count: topResults.length,
        days,
        tenant_id: req.tenantId,
        user_id: req.user.id
      });

      res.json({
        status: 'success',
        data: { topResults }
      });

    } catch (error) {
      logger.error('Error retrieving top search results', {
        error: error.message,
        tenant_id: req.tenantId,
        user_id: req.user?.id
      });
      next(error);
    }
  }
}

module.exports = new SearchResultController();