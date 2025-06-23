'use strict';

const { Model } = require('sequelize');
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:search-result');

module.exports = (sequelize, DataTypes) => {
  class SearchResult extends Model {
    static associate(models) {
      // Relazione con tenant per multi-tenancy
      SearchResult.belongsTo(models.Tenant, {
        foreignKey: 'tenant_id',
        as: 'tenant'
      });

      // Relazione con SavedSearch
      SearchResult.belongsTo(models.SavedSearch, {
        foreignKey: 'saved_search_id',
        as: 'savedSearch'
      });

      // Relazione con SearchExecution
      SearchResult.belongsTo(models.SearchExecution, {
        foreignKey: 'search_execution_id',
        as: 'searchExecution'
      });
    }

    // Verifica se il risultato è nuovo (prima volta che appare per questa ricerca)
    isNewResult() {
      return this.is_new_result === true;
    }

    // Ottieni score di rilevanza formattato
    getRelevanceScore() {
      return this.relevance_score ? Math.round(this.relevance_score * 100) / 100 : 0;
    }

    // Ottieni insights AI se disponibili
    getAiInsights() {
      return this.ai_insights || {};
    }

    // Verifica se ha insights specifici
    hasAiInsight(type) {
      const insights = this.getAiInsights();
      return insights[type] !== undefined;
    }

    // Ottieni raccomandazione AI
    getAiRecommendation() {
      const insights = this.getAiInsights();
      return insights.recommendation || null;
    }

    // Ottieni score qualità da AI
    getQualityScore() {
      const insights = this.getAiInsights();
      return insights.quality_score || null;
    }

    // Ottieni tags automatici da AI
    getAiTags() {
      const insights = this.getAiInsights();
      return insights.tags || [];
    }

    // Ottieni summary AI (non viola copyright perché è analisi nostra)
    getAiSummary() {
      return this.ai_summary || null;
    }

    // Metodo per aggiornare insights AI
    async updateAiInsights(newInsights) {
      const currentInsights = this.getAiInsights();
      const updatedInsights = {
        ...currentInsights,
        ...newInsights,
        last_updated: new Date().toISOString()
      };
      
      await this.update({ ai_insights: updatedInsights });
      return updatedInsights;
    }

    // Ottieni URL per aprire annuncio originale
    getOriginalUrl() {
      return this.external_url;
    }

    // Ottieni info display per UI
    getDisplayInfo() {
      return {
        title: this.basic_title,
        price: this.basic_price,
        location: this.basic_location,
        source: this.source_platform,
        url: this.external_url,
        relevanceScore: this.getRelevanceScore(),
        qualityScore: this.getQualityScore(),
        recommendation: this.getAiRecommendation(),
        summary: this.getAiSummary(),
        tags: this.getAiTags(),
        isNew: this.isNewResult()
      };
    }

    // Calcola match score basato su criteri ricerca
    static calculateRelevanceScore(basicData, searchCriteria) {
      let score = 0;
      let maxScore = 0;
      
      // Score per location (peso: 30%)
      maxScore += 30;
      if (searchCriteria.location && basicData.location) {
        const locationMatch = basicData.location.toLowerCase().includes(searchCriteria.location.toLowerCase());
        if (locationMatch) score += 30;
      } else {
        score += 15; // Partial score se no location specified
      }
      
      // Score per prezzo (peso: 40%) - più importante per filtering
      maxScore += 40;
      if (searchCriteria.price_min || searchCriteria.price_max) {
        const price = parseFloat(basicData.price) || 0;
        const withinRange = (!searchCriteria.price_min || price >= searchCriteria.price_min) &&
                           (!searchCriteria.price_max || price <= searchCriteria.price_max);
        if (withinRange) {
          score += 40;
        } else {
          // Partial score based on distance from range
          const distance = Math.min(
            searchCriteria.price_min ? Math.abs(price - searchCriteria.price_min) : 0,
            searchCriteria.price_max ? Math.abs(price - searchCriteria.price_max) : 0
          );
          const maxAcceptableDistance = (searchCriteria.price_max || searchCriteria.price_min) * 0.2;
          if (distance <= maxAcceptableDistance) {
            score += Math.round(40 * (1 - distance / maxAcceptableDistance));
          }
        }
      } else {
        score += 20; // Partial score
      }
      
      // Score per property type (peso: 20%)
      maxScore += 20;
      if (searchCriteria.property_type && basicData.title) {
        const titleLower = basicData.title.toLowerCase();
        const typeWords = {
          apartment: ['appartamento', 'app', 'trilocale', 'bilocale', 'monolocale'],
          house: ['casa', 'villetta', 'abitazione'],
          villa: ['villa'],
          office: ['ufficio', 'locale commerciale']
        };
        
        const searchWords = typeWords[searchCriteria.property_type] || [];
        const hasMatch = searchWords.some(word => titleLower.includes(word));
        if (hasMatch) score += 20;
      } else {
        score += 10; // Partial score
      }
      
      // Score per platform reliability (peso: 10%)
      maxScore += 10;
      const platformScores = {
        'immobiliare.it': 10,
        'casa.it': 8,
        'idealista.it': 9,
        'subito.it': 6
      };
      score += platformScores[basicData.source_platform] || 5;
      
      // Normalizza score (0-1)
      return maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
    }

    // Verifica se il risultato dovrebbe generare notifica
    shouldNotify() {
      return this.isNewResult() && this.getRelevanceScore() >= 0.7; // Solo risultati molto rilevanti
    }

    // Verifica se l'URL è ancora valido (per future cleanup)
    static isValidUrl(url) {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    }

    // Estrai ID esterno da URL per deduplication
    static extractExternalId(url, platform) {
      try {
        const urlObj = new URL(url);
        
        switch (platform) {
          case 'immobiliare.it':
            const match = url.match(/\/(\d+)\/$/);
            return match ? match[1] : null;
          case 'casa.it':
            const pathMatch = urlObj.pathname.match(/\/(\d+)$/);
            return pathMatch ? pathMatch[1] : null;
          default:
            return urlObj.pathname.split('/').pop();
        }
      } catch {
        return null;
      }
    }
  }
  
  SearchResult.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tenants',
        key: 'id'
      }
    },
    saved_search_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'saved_searches',
        key: 'id'
      }
    },
    search_execution_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'search_executions',
        key: 'id'
      }
    },
    
    // === LINK TO ORIGINAL (NO COPYRIGHT VIOLATION) ===
    
    external_url: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      validate: {
        isUrl: true,
        len: [10, 1000]
      },
      comment: 'URL annuncio originale (immobiliare.it, casa.it, etc.)'
    },
    source_platform: {
      type: DataTypes.ENUM('immobiliare.it', 'casa.it', 'idealista.it', 'subito.it'),
      allowNull: false
    },
    external_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'ID annuncio nel sistema esterno (per deduplication)'
    },
    
    // === BASIC METADATA (MINIMAL INFO FOR REFERENCE) ===
    
    basic_title: {
      type: DataTypes.STRING(300),
      allowNull: true,
      comment: 'Titolo basic per reference (non redistribuzione)'
    },
    basic_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      comment: 'Prezzo per sorting/filtering'
    },
    basic_location: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Location basic (città) per grouping'
    },
    
    // === AI ANALYSIS (OUR VALUE-ADD) ===
    
    relevance_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 0.0,
      validate: {
        min: 0.0,
        max: 1.0,
        isDecimal: true
      },
      comment: 'Score di rilevanza 0-1 basato su match criteri'
    },
    ai_insights: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Insights AI: quality_score, features_detected, recommendations, etc.'
    },
    ai_summary: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Summary AI generato (non copia contenuto originale)'
    },
    ai_recommendation: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Raccomandazione personalizzata AI'
    },
    ai_processed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp elaborazione AI'
    },
    
    // === TRACKING ===
    
    is_new_result: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'True se è la prima volta che questo annuncio appare per questa ricerca'
    },
    found_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Timestamp quando annuncio è stato trovato'
    },
    last_seen_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Ultima volta che annuncio era ancora disponibile'
    },
    
    // === STATUS TRACKING ===
    
    status: {
      type: DataTypes.ENUM('active', 'unavailable', 'expired'),
      allowNull: false,
      defaultValue: 'active',
      comment: 'Status annuncio sulla piattaforma originale'
    }
  }, {
    sequelize,
    modelName: 'SearchResult',
    tableName: 'search_results',
    underscored: true,
    timestamps: true,
    
    // Indici per performance
    indexes: [
      // Indice composito per ricerche per saved_search
      {
        name: 'idx_search_results_saved_search',
        fields: ['saved_search_id', 'found_at']
      },
      
      // Indice per search execution
      {
        name: 'idx_search_results_execution',
        fields: ['search_execution_id']
      },
      
      // Indice per tenant isolation
      {
        name: 'idx_search_results_tenant',
        fields: ['tenant_id']
      },
      
      // Indice per relevance scoring
      {
        name: 'idx_search_results_relevance',
        fields: ['relevance_score', 'is_new_result']
      },
      
      // Indice per deduplication
      {
        name: 'idx_search_results_external',
        fields: ['source_platform', 'external_id']
      },
      
      // Indice per AI processing
      {
        name: 'idx_search_results_ai_processing',
        fields: ['ai_processed_at']
      },
      
      // Indice per basic filtering
      {
        name: 'idx_search_results_basic_filters',
        fields: ['basic_price', 'basic_location', 'status']
      },
      
      // Indice per status tracking
      {
        name: 'idx_search_results_status',
        fields: ['status', 'last_seen_at']
      }
    ],
    
    scopes: {
      // Scope per rilevanza
      highRelevance: {
        where: {
          relevance_score: {
            [sequelize.Sequelize.Op.gte]: 0.7
          }
        }
      },
      
      // Scope per risultati nuovi
      newResults: {
        where: { is_new_result: true }
      },
      
      // Scope per ricerca specifica
      bySavedSearch: (savedSearchId) => ({
        where: { saved_search_id: savedSearchId }
      }),
      
      // Scope per esecuzione specifica
      byExecution: (executionId) => ({
        where: { search_execution_id: executionId }
      }),
      
      // Scope per platform
      byPlatform: (platform) => ({
        where: { source_platform: platform }
      }),
      
      // Scope per risultati recenti
      recentlyFound: {
        where: {
          found_at: {
            [sequelize.Sequelize.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Ultime 24h
          }
        }
      },
      
      // Scope per risultati attivi
      active: {
        where: { status: 'active' }
      },
      
      // Scope per AI processing
      needsAiProcessing: {
        where: {
          ai_processed_at: null
        }
      },
      
      withAiInsights: {
        where: {
          ai_processed_at: {
            [sequelize.Sequelize.Op.not]: null
          }
        }
      },
      
      // Scope per notifiche
      shouldNotify: {
        where: {
          is_new_result: true,
          relevance_score: {
            [sequelize.Sequelize.Op.gte]: 0.7
          }
        }
      },
      
      // Scope con price range
      priceRange: (min, max) => ({
        where: {
          basic_price: {
            [sequelize.Sequelize.Op.between]: [min, max]
          }
        }
      })
    },

    hooks: {
      beforeValidate: (searchResult, options) => {
        // Extract external_id se non presente
        if (!searchResult.external_id && searchResult.external_url) {
          searchResult.external_id = SearchResult.extractExternalId(
            searchResult.external_url, 
            searchResult.source_platform
          );
        }
        
        // Valida URL
        if (!SearchResult.isValidUrl(searchResult.external_url)) {
          throw new Error('URL annuncio non valido');
        }
      },
      
      beforeCreate: (searchResult, options) => {
        logger.info(`Creating search result: platform ${searchResult.source_platform}, execution ${searchResult.search_execution_id}, score ${searchResult.relevance_score}`);
      },
      
      afterCreate: async (searchResult, options) => {
        logger.info(`Search result created: ID ${searchResult.id}, relevance: ${searchResult.relevance_score}`);
        
        // Mark previous results as not new for this search-external_id combination
        if (searchResult.external_id) {
          await sequelize.models.SearchResult.update(
            { is_new_result: false },
            {
              where: {
                saved_search_id: searchResult.saved_search_id,
                source_platform: searchResult.source_platform,
                external_id: searchResult.external_id,
                id: {
                  [sequelize.Sequelize.Op.ne]: searchResult.id
                }
              },
              validate: false
            }
          );
        }
      },
      
      afterUpdate: (searchResult, options) => {
        if (searchResult.changed('ai_insights')) {
          logger.info(`AI insights updated for search result ${searchResult.id}`);
        }
        
        if (searchResult.changed('status')) {
          logger.info(`Search result ${searchResult.id} status changed to: ${searchResult.status}`);
        }
      }
    }
  });
  
  return SearchResult;
};