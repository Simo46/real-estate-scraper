'use strict';

const { Model } = require('sequelize');
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:saved-search');

module.exports = (sequelize, DataTypes) => {
  class SavedSearch extends Model {
    static associate(models) {
      // Relazione con tenant per multi-tenancy
      SavedSearch.belongsTo(models.Tenant, {
        foreignKey: 'tenant_id',
        as: 'tenant'
      });

      // Relazione con User che ha creato la ricerca
      SavedSearch.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
      });
      
      SavedSearch.belongsTo(models.User, {
        foreignKey: 'created_by',
        as: 'creator'
      });
      
      SavedSearch.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updater'
      });

      // Relazione con SearchResult (una ricerca può avere molti risultati)
      SavedSearch.hasMany(models.SearchResult, {
        foreignKey: 'saved_search_id',
        as: 'results'
      });

      // Relazione con SearchExecution (una ricerca può avere molte esecuzioni)
      SavedSearch.hasMany(models.SearchExecution, {
        foreignKey: 'saved_search_id',
        as: 'executions'
      });
    }

    // Verifica se la ricerca è attiva
    isActive() {
      return this.is_active && !this.deleted_at;
    }

    // Verifica se deve essere eseguita automaticamente
    shouldAutoExecute() {
      if (!this.isActive() || !this.execution_frequency) return false;
      
      if (!this.last_executed_at) return true; // Mai eseguita
      
      const now = new Date();
      const lastExecution = new Date(this.last_executed_at);
      const diffHours = (now - lastExecution) / (1000 * 60 * 60);
      
      switch (this.execution_frequency) {
        case 'hourly': return diffHours >= 1;
        case 'daily': return diffHours >= 24;
        case 'weekly': return diffHours >= (24 * 7);
        case 'monthly': return diffHours >= (24 * 30);
        default: return false; // manual only
      }
    }

    // Ottieni criteri di ricerca strutturati
    getCriteria() {
      return this.structured_criteria || {};
    }

    // Ottieni query in linguaggio naturale
    getNaturalQuery() {
      return this.natural_language_query || '';
    }

    // Imposta criteri di ricerca
    setCriteria(criteria) {
      this.structured_criteria = {
        ...this.getCriteria(),
        ...criteria
      };
    }

    // Ottieni storico esecuzioni (dalle relazioni)
    async getExecutionHistory(limit = 10) {
      const results = await this.getResults({
        order: [['created_at', 'DESC']],
        limit: limit,
        include: [
          {
            model: sequelize.models.Listing,
            as: 'listing',
            attributes: ['id', 'title', 'price', 'city']
          }
        ]
      });
      
      return results;
    }

    // Conteggio risultati ultima esecuzione
    async getLastResultsCount() {
      if (!this.last_executed_at) return 0;
      
      const count = await sequelize.models.SearchResult.count({
        where: {
          saved_search_id: this.id,
          created_at: {
            [sequelize.Sequelize.Op.gte]: this.last_executed_at
          }
        }
      });
      
      return count;
    }

    // Marca ricerca come eseguita
    async markAsExecuted(resultsCount = 0) {
      await this.update({
        last_executed_at: new Date(),
        execution_count: (this.execution_count || 0) + 1
      });
      
      logger.info(`Search ${this.id} executed with ${resultsCount} results`);
    }

    // Verifica se criteri sono validi
    static isValidCriteria(criteria) {
      if (!criteria || typeof criteria !== 'object') return false;
      
      // Almeno un criterio deve essere specificato
      const validFields = [
        'location', 'property_type', 'price_min', 'price_max',
        'bedrooms', 'bathrooms', 'sqm_min', 'sqm_max'
      ];
      
      return validFields.some(field => criteria[field] !== undefined);
    }

    // Converte criteri naturali in strutturati (placeholder per AI)
    static async parseNaturalLanguage(query) {
      // Placeholder per integrazione futura con AI
      // Per ora restituisce criteri base estratti manualmente
      
      const criteria = {};
      const lowerQuery = query.toLowerCase();
      
      // Estrazione location
      const cities = ['milano', 'roma', 'torino', 'napoli', 'firenze'];
      for (const city of cities) {
        if (lowerQuery.includes(city)) {
          criteria.location = city.charAt(0).toUpperCase() + city.slice(1);
          break;
        }
      }
      
      // Estrazione prezzo
      const priceMatch = lowerQuery.match(/(\d+)k?(?:\s*euro|\s*€|$)/);
      if (priceMatch) {
        const price = parseInt(priceMatch[1]);
        criteria.price_max = price > 1000 ? price : price * 1000;
      }
      
      // Estrazione camere
      const roomMatch = lowerQuery.match(/(\d+)\s*(?:camere|locali|stanze)/);
      if (roomMatch) {
        criteria.bedrooms = parseInt(roomMatch[1]);
      }
      
      // Property type
      if (lowerQuery.includes('appartamento')) criteria.property_type = 'apartment';
      if (lowerQuery.includes('casa')) criteria.property_type = 'house';
      if (lowerQuery.includes('villa')) criteria.property_type = 'villa';
      
      return criteria;
    }
  }
  
  SavedSearch.init({
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
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    
    // === INFORMAZIONI RICERCA ===
    
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        len: [3, 200],
        notEmpty: true
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    natural_language_query: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Query originale in linguaggio naturale'
    },
    structured_criteria: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Criteri di ricerca strutturati: {location, price_range, property_type, etc}',
      validate: {
        isValidCriteria(value) {
          if (!SavedSearch.isValidCriteria(value)) {
            throw new Error('Criteri di ricerca non validi');
          }
        }
      }
    },
    
    // === CONFIGURAZIONE ESECUZIONE ===
    
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    execution_frequency: {
      type: DataTypes.ENUM('manual', 'hourly', 'daily', 'weekly', 'monthly'),
      allowNull: false,
      defaultValue: 'manual'
    },
    last_executed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    execution_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    
    // === CONFIGURAZIONE NOTIFICHE ===
    
    notify_on_new_results: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    min_results_for_notification: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 0,
        max: 100
      }
    },
    last_notification_sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    
    // === AUDIT TRAIL ===
    
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    updated_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'SavedSearch',
    tableName: 'saved_searches',
    underscored: true,
    paranoid: true,     // Soft delete
    timestamps: true,
    
    scopes: {
      active: {
        where: { is_active: true }
      },
      byUser: (userId) => ({
        where: { user_id: userId }
      }),
      autoExecutable: {
        where: {
          is_active: true,
          execution_frequency: {
            [sequelize.Sequelize.Op.ne]: 'manual'
          }
        }
      },
      pendingExecution: {
        where: {
          is_active: true,
          execution_frequency: {
            [sequelize.Sequelize.Op.ne]: 'manual'
          },
          [sequelize.Sequelize.Op.or]: [
            { last_executed_at: null },
            {
              last_executed_at: {
                [sequelize.Sequelize.Op.lt]: sequelize.literal(
                  "NOW() - INTERVAL '1 hour'"
                )
              }
            }
          ]
        }
      },
      withNotifications: {
        where: { notify_on_new_results: true }
      }
    },

    hooks: {
      beforeValidate: async (savedSearch, options) => {
        // Analizza linguaggio naturale se presente e criteri strutturati vuoti
        if (savedSearch.natural_language_query && 
            (!savedSearch.structured_criteria || Object.keys(savedSearch.structured_criteria).length === 0)) {
          
          const parsedCriteria = await SavedSearch.parseNaturalLanguage(savedSearch.natural_language_query);
          savedSearch.structured_criteria = parsedCriteria;
        }
      },
      
      beforeCreate: (savedSearch, options) => {
        logger.info(`Creating saved search: ${savedSearch.name} for user ${savedSearch.user_id}`);
        
        // Imposta created_by se non specificato
        if (!savedSearch.created_by && savedSearch.user_id) {
          savedSearch.created_by = savedSearch.user_id;
        }
      },
      
      afterCreate: (savedSearch, options) => {
        logger.info(`Saved search created successfully: ID ${savedSearch.id}`);
      },
      
      beforeUpdate: (savedSearch, options) => {
        if (savedSearch.changed('is_active')) {
          logger.info(`Saved search ${savedSearch.id} ${savedSearch.is_active ? 'activated' : 'deactivated'}`);
        }
        
        if (savedSearch.changed('execution_frequency')) {
          logger.info(`Saved search ${savedSearch.id} frequency changed to: ${savedSearch.execution_frequency}`);
        }
      }
    }
  });
  
  return SavedSearch;
};