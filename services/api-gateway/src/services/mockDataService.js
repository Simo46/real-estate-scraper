'use strict';

const { createLogger } = require('../utils/logger');
const logger = createLogger('services:mockData');

/**
 * Mock Data Service - Sistema di simulazione per testing e development
 * Responsabilità:
 * - Interfaccia principale per mock data generation
 * - Simulation di diversi scenari di ricerca
 * - Gestione timing realistico (simulate network delays)
 * - Integration con Search Engine
 */
class MockDataService {
  constructor() {
    // Inizializzazione lazy per evitare circular dependencies
    this.mockResultsGenerator = null;
    this.mockAIInsights = null;
    
    this.scenarioWeights = {
      success: 0.7,
      partial_failure: 0.15,
      no_results: 0.10,
      high_volume: 0.05
    };

    this.platformResponseTimes = {
      'immobiliare.it': { min: 1500, max: 3000 },
      'casa.it': { min: 1200, max: 2500 },
      'idealista.it': { min: 1800, max: 3500 }
    };
  }

  /**
   * Inizializzazione lazy dei servizi dipendenti
   */
  _initializeDependencies() {
    if (!this.mockResultsGenerator) {
      const MockResultsGenerator = require('../utils/mockResultsGenerator');
      this.mockResultsGenerator = new MockResultsGenerator();
    }
    if (!this.mockAIInsights) {
      const MockAIInsights = require('../utils/mockAIInsights');
      this.mockAIInsights = new MockAIInsights();
    }
  }

  /**
   * Simula una ricerca completa (entry point principale)
   * @param {Object} criteria - Criteri di ricerca
   * @param {string} executionId - ID dell'esecuzione
   * @returns {Array} Array di risultati simulati
   */
  async simulateSearch(criteria, executionId) {
    this._initializeDependencies();

    logger.info('Starting search simulation', {
      executionId,
      criteria: this._sanitizeCriteriaForLog(criteria)
    });

    const startTime = Date.now();

    try {
      // Determina scenario da simulare
      const scenario = this._selectScenario(criteria);
      logger.debug('Selected simulation scenario', { scenario, executionId });

      // Simula execution time
      await this.simulateProcessingDelay(criteria);

      // Esegui scenario specifico
      let results = [];
      switch (scenario) {
        case 'success':
          results = await this.simulateSuccessScenario(criteria);
          break;
        case 'partial_failure':
          results = await this.simulatePartialFailureScenario(criteria);
          break;
        case 'no_results':
          results = await this.simulateNoResultsScenario(criteria);
          break;
        case 'high_volume':
          results = await this.simulateHighVolumeScenario(criteria);
          break;
        default:
          results = await this.simulateSuccessScenario(criteria);
      }

      // Converti in formato SearchResult
      const searchResults = await this.convertToSearchResults(
        results, 
        executionId, 
        criteria.tenant_id
      );

      const executionTime = Date.now() - startTime;
      logger.info('Search simulation completed', {
        executionId,
        scenario,
        resultsCount: searchResults.length,
        executionTimeMs: executionTime
      });

      return searchResults;

    } catch (error) {
      logger.error('Search simulation failed', {
        error: error.message,
        executionId,
        criteria: this._sanitizeCriteriaForLog(criteria)
      });
      throw error;
    }
  }

  /**
   * Genera risultati mock realistici
   * @param {Object} criteria - Criteri di ricerca
   * @param {number} count - Numero risultati da generare
   * @returns {Array} Array di risultati mock
   */
  async generateMockResults(criteria, count = 50) {
    this._initializeDependencies();

    const actualCount = Math.min(count, criteria.filters?.max_results || 50);
    
    logger.debug('Generating mock results', {
      requestedCount: count,
      actualCount,
      criteria: this._sanitizeCriteriaForLog(criteria)
    });

    return await this.mockResultsGenerator.generateRealisticListings(
      criteria, 
      actualCount
    );
  }

  /**
   * Simula timing di esecuzione realistico
   * @param {Object} criteria - Criteri che influenzano il timing
   * @returns {number} Tempo simulato in ms
   */
  async simulateExecutionTime(criteria) {
    const platforms = criteria.filters?.platforms || ['immobiliare.it'];
    const maxResults = criteria.filters?.max_results || 50;
    const complexity = this._assessComplexity(criteria);

    let totalTime = 0;

    // Base processing time
    totalTime += 500 + Math.random() * 1000;

    // Platform-specific times
    for (const platform of platforms) {
      const platformTime = this._getPlatformResponseTime(platform);
      totalTime += platformTime;
    }

    // Complexity multiplier
    const complexityMultiplier = {
      'low': 1.0,
      'medium': 1.3,
      'high': 1.8
    }[complexity] || 1.0;

    totalTime *= complexityMultiplier;

    // Results count impact
    if (maxResults > 100) {
      totalTime *= 1.2;
    }

    return Math.round(totalTime);
  }

  /**
   * Scenario: Successo normale (30-80 risultati)
   */
  async simulateSuccessScenario(criteria) {
    const count = 30 + Math.floor(Math.random() * 50); // 30-80 risultati
    return await this.generateMockResults(criteria, count);
  }

  /**
   * Scenario: Fallimento parziale (alcuni platform falliscono)
   */
  async simulatePartialFailureScenario(criteria) {
    const platforms = criteria.filters?.platforms || ['immobiliare.it'];
    const workingPlatforms = platforms.slice(0, Math.ceil(platforms.length / 2));
    
    logger.warn('Simulating partial failure scenario', {
      totalPlatforms: platforms.length,
      workingPlatforms: workingPlatforms.length
    });

    // Genera risultati solo per platform funzionanti
    const modifiedCriteria = {
      ...criteria,
      filters: {
        ...criteria.filters,
        platforms: workingPlatforms
      }
    };

    const count = 15 + Math.floor(Math.random() * 25); // 15-40 risultati
    return await this.generateMockResults(modifiedCriteria, count);
  }

  /**
   * Scenario: Nessun risultato
   */
  async simulateNoResultsScenario(criteria) {
    logger.info('Simulating no results scenario', {
      criteria: this._sanitizeCriteriaForLog(criteria)
    });

    return []; // Nessun risultato
  }

  /**
   * Scenario: Alto volume (150+ risultati)
   */
  async simulateHighVolumeScenario(criteria) {
    const count = 150 + Math.floor(Math.random() * 100); // 150-250 risultati
    
    logger.info('Simulating high volume scenario', {
      resultCount: count,
      criteria: this._sanitizeCriteriaForLog(criteria)
    });

    return await this.generateMockResults(criteria, count);
  }

  /**
   * Simula risposta di una piattaforma specifica
   * @param {string} platform - Nome piattaforma
   * @param {Object} criteria - Criteri ricerca
   * @returns {Object} Risposta simulata
   */
  async simulatePlatformResponse(platform, criteria) {
    const responseTime = this._getPlatformResponseTime(platform);
    
    // Simula network delay
    await new Promise(resolve => setTimeout(resolve, responseTime));

    // Simula errori random
    if (Math.random() < 0.05) { // 5% chance di errore
      throw new Error(`Platform ${platform} temporarily unavailable`);
    }

    const resultsCount = this._getPlatformResultsCount(platform, criteria);
    const results = await this.generateMockResults(criteria, resultsCount);

    return {
      platform,
      response_time_ms: responseTime,
      results_count: results.length,
      results: results.map(r => ({ ...r, source_platform: platform })),
      status: 'success'
    };
  }

  /**
   * Simula errori di piattaforma
   * @param {string} platform - Nome piattaforma
   * @param {number} errorRate - Percentuale errori (0-1)
   */
  async simulatePlatformErrors(platform, errorRate = 0.1) {
    if (Math.random() < errorRate) {
      const errorTypes = [
        'RATE_LIMITED',
        'CONNECTION_TIMEOUT',
        'INVALID_RESPONSE',
        'PLATFORM_MAINTENANCE'
      ];
      
      const errorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
      throw new Error(`${platform}: ${errorType}`);
    }
  }

  /**
   * Simula rate limiting
   * @param {string} platform - Nome piattaforma
   */
  async simulateRateLimiting(platform) {
    // Simula rate limiting casuale
    if (Math.random() < 0.03) { // 3% chance
      const delay = 5000 + Math.random() * 10000; // 5-15 secondi
      
      logger.warn('Simulating rate limiting', {
        platform,
        delayMs: delay
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
      throw new Error(`Rate limited by ${platform}. Please try again later.`);
    }
  }

  /**
   * Converte mock data in SearchResult format
   * @param {Array} mockData - Dati mock generati
   * @param {string} executionId - ID esecuzione
   * @param {string} tenantId - ID tenant
   * @returns {Array} Array di SearchResult objects
   */
  async convertToSearchResults(mockData, executionId, tenantId) {
    this._initializeDependencies();

    const searchResults = [];

    for (const mockResult of mockData) {
      try {
        // Genera AI insights per ogni risultato
        const aiInsights = await this.mockAIInsights.generatePropertyAnalysis(mockResult);
        const aiSummary = await this.mockAIInsights.generateAISummary(mockResult);
        const aiRecommendation = await this.mockAIInsights.generateAIRecommendation(mockResult);

        const searchResult = {
          tenant_id: tenantId,
          execution_id: executionId,
          external_url: mockResult.external_url,
          source_platform: mockResult.source_platform,
          basic_title: mockResult.basic_title,
          basic_price: mockResult.basic_price,
          basic_location: mockResult.basic_location,
          relevance_score: mockResult.relevance_score,
          ai_insights: aiInsights,
          ai_summary: aiSummary,
          ai_recommendation: aiRecommendation,
          found_at: new Date()
        };

        searchResults.push(searchResult);

      } catch (error) {
        logger.error('Failed to convert mock result to SearchResult', {
          error: error.message,
          mockResult: mockResult.external_url
        });
        // Continuiamo con gli altri risultati
      }
    }

    return searchResults;
  }

  /**
   * Simula delay di processing
   * @param {number} resultCount - Numero risultati che influenza il delay
   */
  async simulateProcessingDelay(criteria) {
    const baseDelay = 1000; // 1 secondo base
    const platforms = criteria.filters?.platforms || ['immobiliare.it'];
    const maxResults = criteria.filters?.max_results || 50;
    
    let totalDelay = baseDelay;
    
    // Aggiungi delay per platform multipli
    totalDelay += (platforms.length - 1) * 500;
    
    // Aggiungi delay per risultati numerosi
    if (maxResults > 100) {
      totalDelay += 1000;
    }
    
    // Aggiungi randomness
    totalDelay += Math.random() * 1000;
    
    logger.debug('Simulating processing delay', {
      delayMs: totalDelay,
      platforms: platforms.length,
      maxResults
    });
    
    await new Promise(resolve => setTimeout(resolve, totalDelay));
  }

  /**
   * Private helper methods
   */
  _selectScenario(criteria) {
    // Logica per selezionare scenario basata sui criteri
    
    // Se criteri molto specifici, più probabilità di no_results
    if (this._isCriteriaTooSpecific(criteria)) {
      return Math.random() < 0.3 ? 'no_results' : 'success';
    }
    
    // Se location molto popolare, più probabilità di high_volume
    if (this._isPopularLocation(criteria.location)) {
      return Math.random() < 0.15 ? 'high_volume' : 'success';
    }
    
    // Random selection basato su pesi
    const random = Math.random();
    let cumulative = 0;
    
    for (const [scenario, weight] of Object.entries(this.scenarioWeights)) {
      cumulative += weight;
      if (random <= cumulative) {
        return scenario;
      }
    }
    
    return 'success'; // fallback
  }

  _isCriteriaTooSpecific(criteria) {
    let specificityScore = 0;
    
    // Price range molto stretto
    if (criteria.price?.min && criteria.price?.max) {
      const range = criteria.price.max - criteria.price.min;
      if (range < 50000) specificityScore += 2;
    }
    
    // Rooms molto specifici
    if (criteria.property?.rooms?.exact) {
      specificityScore += 1;
    }
    
    // Size range molto stretto
    if (criteria.property?.size_sqm?.min && criteria.property?.size_sqm?.max) {
      const range = criteria.property.size_sqm.max - criteria.property.size_sqm.min;
      if (range < 20) specificityScore += 2;
    }
    
    // Molti filtri specifici
    if (criteria.property?.features?.length > 3) {
      specificityScore += 1;
    }
    
    return specificityScore >= 3;
  }

  _isPopularLocation(location) {
    if (!location?.city) return false;
    
    const popularCities = ['milano', 'roma', 'torino', 'firenze', 'napoli'];
    return popularCities.includes(location.city.toLowerCase());
  }

  _getPlatformResponseTime(platform) {
    const timing = this.platformResponseTimes[platform] || { min: 1000, max: 3000 };
    return timing.min + Math.random() * (timing.max - timing.min);
  }

  _getPlatformResultsCount(platform, criteria) {
    const baseCount = 30;
    const maxResults = criteria.filters?.max_results || 50;
    
    // Platform-specific multipliers
    const multipliers = {
      'immobiliare.it': 1.5,
      'casa.it': 1.2,
      'idealista.it': 0.8
    };
    
    const multiplier = multipliers[platform] || 1.0;
    const count = Math.floor(baseCount * multiplier * (0.5 + Math.random()));
    
    return Math.min(count, maxResults);
  }

  _assessComplexity(criteria) {
    let score = 0;
    
    if (criteria.location?.areas?.length > 2) score += 1;
    if (criteria.property?.features?.length > 2) score += 1;
    if (criteria.filters?.platforms?.length > 2) score += 1;
    if (criteria.filters?.max_results > 100) score += 1;
    
    if (score <= 1) return 'low';
    if (score <= 2) return 'medium';
    return 'high';
  }

  _sanitizeCriteriaForLog(criteria) {
    // Rimuovi dati sensibili per logging
    return {
      location: criteria.location?.city,
      property_type: criteria.property?.type,
      price_range: criteria.price ? `${criteria.price.min || 0}-${criteria.price.max || 'unlimited'}` : 'any',
      platforms: criteria.filters?.platforms?.length || 0,
      max_results: criteria.filters?.max_results || 50
    };
  }
}

module.exports = MockDataService;
