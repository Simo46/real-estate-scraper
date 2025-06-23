'use strict';

const { Model } = require('sequelize');
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:search-execution');

module.exports = (sequelize, DataTypes) => {
  class SearchExecution extends Model {
    static associate(models) {
      // Relazione con tenant per multi-tenancy
      SearchExecution.belongsTo(models.Tenant, {
        foreignKey: 'tenant_id',
        as: 'tenant'
      });

      // Relazione con SavedSearch che ha generato questa esecuzione
      SearchExecution.belongsTo(models.SavedSearch, {
        foreignKey: 'saved_search_id',
        as: 'savedSearch'
      });

      // Una esecuzione può avere molti risultati
      SearchExecution.hasMany(models.SearchResult, {
        foreignKey: 'search_execution_id',
        as: 'results'
      });

      // User che ha triggerato l'esecuzione
      SearchExecution.belongsTo(models.User, {
        foreignKey: 'executed_by',
        as: 'executor'
      });
    }

    // Verifica se l'esecuzione è completata con successo
    isSuccessful() {
      return this.status === 'completed' && this.total_results_found >= 0;
    }

    // Verifica se ha prodotto nuovi risultati
    hasNewResults() {
      return this.new_results_count > 0;
    }

    // Ottieni durata esecuzione in secondi
    getDurationSeconds() {
      return this.execution_duration_ms ? Math.round(this.execution_duration_ms / 1000) : null;
    }

    // Ottieni piattaforme cercate come array
    getPlatformsSearched() {
      return this.platforms_searched || [];
    }

    // Ottieni errori come array
    getErrors() {
      return this.execution_errors || [];
    }

    // Calcola success rate per piattaforma
    getSuccessRate() {
      const platforms = this.getPlatformsSearched();
      const errors = this.getErrors();
      
      if (platforms.length === 0) return 0;
      
      const successfulPlatforms = platforms.length - errors.length;
      return Math.round((successfulPlatforms / platforms.length) * 100);
    }

    // Verifica se ha raggiunto il limite di rate limiting
    isRateLimited() {
      const errors = this.getErrors();
      return errors.some(error => 
        error.type === 'rate_limit' || 
        error.message.toLowerCase().includes('rate limit')
      );
    }

    // Ottieni summary dell'esecuzione
    getSummary() {
      return {
        status: this.status,
        duration: this.getDurationSeconds(),
        totalResults: this.total_results_found,
        newResults: this.new_results_count,
        platforms: this.getPlatformsSearched(),
        successRate: this.getSuccessRate(),
        errors: this.getErrors().length
      };
    }

    // Marca esecuzione come iniziata
    async markAsStarted(platforms = []) {
      return await this.update({
        status: 'running',
        started_at: new Date(),
        platforms_searched: platforms
      });
    }

    // Marca esecuzione come completata
    async markAsCompleted(resultsCount = 0, newResultsCount = 0, errors = []) {
      const now = new Date();
      const duration = this.started_at ? now - new Date(this.started_at) : null;
      
      return await this.update({
        status: 'completed',
        completed_at: now,
        execution_duration_ms: duration,
        total_results_found: resultsCount,
        new_results_count: newResultsCount,
        execution_errors: errors
      });
    }

    // Marca esecuzione come fallita
    async markAsFailed(error) {
      return await this.update({
        status: 'failed',
        completed_at: new Date(),
        execution_errors: [
          ...(this.execution_errors || []),
          {
            type: 'execution_failure',
            message: error.message || error,
            timestamp: new Date().toISOString()
          }
        ]
      });
    }

    // Aggiungi errore specifico piattaforma
    async addPlatformError(platform, error) {
      const currentErrors = this.execution_errors || [];
      const newError = {
        type: 'platform_error',
        platform: platform,
        message: error.message || error,
        timestamp: new Date().toISOString()
      };
      
      return await this.update({
        execution_errors: [...currentErrors, newError]
      });
    }
  }
  
  SearchExecution.init({
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
    executed_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'User che ha triggerato esecuzione (null per automatic)'
    },
    
    // === EXECUTION TRACKING ===
    
    execution_type: {
      type: DataTypes.ENUM('manual', 'automatic', 'scheduled'),
      allowNull: false,
      defaultValue: 'manual'
    },
    status: {
      type: DataTypes.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending'
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    execution_duration_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0
      },
      comment: 'Durata esecuzione in millisecondi'
    },
    
    // === SEARCH METADATA ===
    
    platforms_searched: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array di piattaforme cercate: ["immobiliare.it", "casa.it"]'
    },
    search_criteria_snapshot: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Snapshot dei criteri di ricerca al momento esecuzione'
    },
    
    // === RESULTS SUMMARY ===
    
    total_results_found: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    new_results_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      },
      comment: 'Numero di risultati nuovi rispetto a esecuzioni precedenti'
    },
    
    // === ERROR TRACKING ===
    
    execution_errors: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: 'Array di errori durante esecuzione con dettagli'
    },
    
    // === PERFORMANCE METRICS ===
    
    avg_response_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0
      },
      comment: 'Tempo medio risposta piattaforme in ms'
    },
    cache_hit_rate: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      validate: {
        min: 0,
        max: 1
      },
      comment: 'Percentuale cache hit (0-1)'
    }
  }, {
    sequelize,
    modelName: 'SearchExecution',
    tableName: 'search_executions',
    underscored: true,
    timestamps: true,
    
    // Indici per performance
    indexes: [
      // Indice per saved search lookup
      {
        name: 'idx_search_executions_saved_search',
        fields: ['saved_search_id', 'created_at']
      },
      
      // Indice per tenant isolation
      {
        name: 'idx_search_executions_tenant',
        fields: ['tenant_id']
      },
      
      // Indice per status monitoring
      {
        name: 'idx_search_executions_status',
        fields: ['status', 'created_at']
      },
      
      // Indice per user executions
      {
        name: 'idx_search_executions_user',
        fields: ['executed_by', 'created_at']
      },
      
      // Indice per performance queries
      {
        name: 'idx_search_executions_performance',
        fields: ['execution_type', 'status', 'execution_duration_ms']
      },
      
      // Indice per esecuzioni automatiche
      {
        name: 'idx_search_executions_automatic',
        fields: ['execution_type', 'status', 'started_at']
      }
    ],
    
    scopes: {
      // Scope per status
      completed: {
        where: { status: 'completed' }
      },
      running: {
        where: { status: 'running' }
      },
      failed: {
        where: { status: 'failed' }
      },
      
      // Scope per tipo esecuzione
      manual: {
        where: { execution_type: 'manual' }
      },
      automatic: {
        where: { execution_type: 'automatic' }
      },
      
      // Scope per esecuzioni recenti
      recent: {
        where: {
          created_at: {
            [sequelize.Sequelize.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Ultime 24h
          }
        }
      },
      
      // Scope per esecuzioni con risultati
      withResults: {
        where: {
          total_results_found: {
            [sequelize.Sequelize.Op.gt]: 0
          }
        }
      },
      
      // Scope per esecuzioni con nuovi risultati
      withNewResults: {
        where: {
          new_results_count: {
            [sequelize.Sequelize.Op.gt]: 0
          }
        }
      },
      
      // Scope con relazioni
      withSavedSearch: {
        include: [{
          model: sequelize.models.SavedSearch,
          as: 'savedSearch'
        }]
      },
      
      withResults: {
        include: [{
          model: sequelize.models.SearchResult,
          as: 'results'
        }]
      }
    },

    hooks: {
      beforeCreate: (execution, options) => {
        logger.info(`Creating search execution for saved search ${execution.saved_search_id}`);
        
        // Set execution ID come reference se non presente
        if (!execution.id) {
          execution.id = require('crypto').randomUUID();
        }
      },
      
      afterCreate: (execution, options) => {
        logger.info(`Search execution created: ID ${execution.id}, Type: ${execution.execution_type}`);
      },
      
      beforeUpdate: (execution, options) => {
        if (execution.changed('status')) {
          logger.info(`Search execution ${execution.id} status changed to: ${execution.status}`);
          
          // Auto-set timestamps based on status
          if (execution.status === 'running' && !execution.started_at) {
            execution.started_at = new Date();
          }
          
          if (['completed', 'failed', 'cancelled'].includes(execution.status) && !execution.completed_at) {
            execution.completed_at = new Date();
          }
        }
      },
      
      afterUpdate: (execution, options) => {
        if (execution.changed('status') && execution.status === 'completed') {
          logger.info(`Search execution ${execution.id} completed with ${execution.total_results_found} results (${execution.new_results_count} new)`);
        }
      }
    }
  });
  
  return SearchExecution;
};