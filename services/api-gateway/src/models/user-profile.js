'use strict';

const { Model } = require('sequelize');
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:user-profile');

module.exports = (sequelize, DataTypes) => {
  class UserProfile extends Model {
    static associate(models) {
      // Relazione One-to-One con User
      UserProfile.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
      });

      // Relazione con tenant per multi-tenancy
      UserProfile.belongsTo(models.Tenant, {
        foreignKey: 'tenant_id',
        as: 'tenant'
      });

      // Audit trail
      UserProfile.belongsTo(models.User, {
        foreignKey: 'created_by',
        as: 'creator'
      });
      
      UserProfile.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updater'
      });
    }

    // === METODI REAL ESTATE ===

    // Verifica se è un agente immobiliare
    isRealEstateAgent() {
      return this.user_type === 'agent';
    }

    // Verifica se è un compratore
    isBuyer() {
      return this.user_type === 'buyer';
    }

    // Verifica se è admin dell'agenzia
    isAgencyAdmin() {
      return this.user_type === 'admin';
    }

    // Verifica se è un agent verificato
    isVerifiedAgent() {
      return this.isRealEstateAgent() && this.verified;
    }

    // Ottieni preferenze di ricerca
    getSearchPreferences() {
      return this.search_preferences || {
        preferred_areas: [],
        budget_range: { min: 0, max: 0 },
        property_types: []
      };
    }

    // Aggiorna preferenze di ricerca
    async updateSearchPreferences(preferences) {
      const currentPreferences = this.getSearchPreferences();
      const updatedPreferences = {
        ...currentPreferences,
        ...preferences
      };
      
      await this.update({ search_preferences: updatedPreferences });
      return updatedPreferences;
    }

    // Ottieni impostazioni notifiche
    getNotificationSettings() {
      return this.notification_settings || {
        email_alerts: true,
        new_listings: true,
        price_drops: true,
        weekly_digest: false
      };
    }

    // Aggiorna impostazioni notifiche
    async updateNotificationSettings(settings) {
      const currentSettings = this.getNotificationSettings();
      const updatedSettings = {
        ...currentSettings,
        ...settings
      };
      
      await this.update({ notification_settings: updatedSettings });
      return updatedSettings;
    }

    // Ottieni impostazioni agent
    getAgentSettings() {
      return this.agent_settings || {};
    }

    // Aggiorna impostazioni agent
    async updateAgentSettings(settings) {
      const currentSettings = this.getAgentSettings();
      const updatedSettings = {
        ...currentSettings,
        ...settings
      };
      
      await this.update({ agent_settings: updatedSettings });
      return updatedSettings;
    }

    // Verifica se può gestire un listing specifico
    canManageListing(listing) {
      // Agency admin può gestire tutti i listing del tenant
      if (this.isAgencyAdmin()) return true;
      
      // Agent può gestire solo i propri listing
      if (this.isRealEstateAgent()) {
        return listing.created_by === this.user_id;
      }
      
      return false;
    }

    // Ottieni nome completo per display
    getDisplayName() {
      // Richiede il caricamento della relazione user
      if (this.user) {
        return this.user.name;
      }
      return null;
    }

    // Ottieni info complete per agent pubblico
    getPublicAgentInfo() {
      if (!this.public_profile || !this.isRealEstateAgent()) {
        return null;
      }

      return {
        name: this.getDisplayName(),
        bio: this.bio,
        agency_name: this.agency_name,
        verified: this.verified,
        phone: this.phone, // Solo se profilo pubblico
        user_type: this.user_type
      };
    }

    // Metodo helper per validazione telefono
    static isValidPhone(phone) {
      if (!phone) return true; // Campo opzionale
      
      // Regex basilare per numeri italiani e internazionali
      const phoneRegex = /^[\+]?[\d\s\-\(\)]{8,20}$/;
      return phoneRegex.test(phone);
    }

    // Verifica se profile è completo
    isProfileComplete() {
      const requiredFields = {
        buyer: ['user_type'],
        agent: ['user_type', 'phone', 'agency_name'],
        admin: ['user_type', 'phone']
      };

      const required = requiredFields[this.user_type] || [];
      return required.every(field => this[field] && this[field].toString().trim().length > 0);
    }

    // Ottieni completeness score (0-1)
    getProfileCompleteness() {
      const allFields = ['phone', 'bio', 'agency_name', 'license_number'];
      const filledFields = allFields.filter(field => 
        this[field] && this[field].toString().trim().length > 0
      ).length;
      
      return Math.round((filledFields / allFields.length) * 100) / 100;
    }
  }
  
  UserProfile.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tenants',
        key: 'id'
      }
    },
    
    // === REAL ESTATE SPECIFIC DATA ===
    
    user_type: {
      type: DataTypes.ENUM('buyer', 'agent', 'admin'),
      allowNull: false,
      defaultValue: 'buyer',
      comment: 'Tipo utente per contesto real estate',
      validate: {
        isIn: [['buyer', 'agent', 'admin']]
      }
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Numero telefono per contatti real estate',
      validate: {
        isValidPhone(value) {
          if (!UserProfile.isValidPhone(value)) {
            throw new Error('Formato telefono non valido');
          }
        }
      }
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Biografia/descrizione per agent',
      validate: {
        len: [0, 1000]
      }
    },
    license_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Numero licenza per agenti immobiliari',
      validate: {
        len: [0, 100]
      }
    },
    agency_name: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Nome agenzia di appartenenza',
      validate: {
        len: [0, 200]
      }
    },
    
    // === PREFERENCES (JSONB) ===
    
    search_preferences: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        preferred_areas: [],
        budget_range: { min: 0, max: 0 },
        property_types: []
      },
      comment: 'Preferenze di ricerca per buyer'
    },
    notification_settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        email_alerts: true,
        new_listings: true,
        price_drops: true,
        weekly_digest: false
      },
      comment: 'Impostazioni notifiche'
    },
    agent_settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Impostazioni specifiche per agent (aree di competenza, commissioni, etc.)'
    },
    
    // === STATUS ===
    
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Profile verificato (importante per agent)'
    },
    public_profile: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Profilo pubblico visibile agli altri utenti'
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
    modelName: 'UserProfile',
    tableName: 'user_profiles',
    underscored: true,
    paranoid: true,     // Soft delete
    timestamps: true,
    
    scopes: {
      // Scope per tipo utente
      agents: {
        where: { user_type: 'agent' }
      },
      buyers: {
        where: { user_type: 'buyer' }
      },
      admins: {
        where: { user_type: 'admin' }
      },
      
      // Scope per agent verificati
      verifiedAgents: {
        where: { 
          user_type: 'agent',
          verified: true 
        }
      },
      
      // Scope per profili pubblici
      publicProfiles: {
        where: { 
          public_profile: true 
        }
      },
      
      // Scope con user incluso
      withUser: {
        include: [{
          model: sequelize.models.User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'username']
        }]
      },
      
      // Scope per agent completi
      completeAgents: {
        where: {
          user_type: 'agent',
          phone: { [sequelize.Sequelize.Op.not]: null },
          agency_name: { [sequelize.Sequelize.Op.not]: null }
        }
      }
    },

    hooks: {
      beforeValidate: (profile, options) => {
        // Validazioni specifiche per tipo utente
        if (profile.user_type === 'agent') {
          if (!profile.phone) {
            profile.phone = null; // Consenti null ma non string vuota
          }
        }
      },
      
      beforeCreate: (profile, options) => {
        logger.info(`Creating user profile for user ${profile.user_id} with type ${profile.user_type}`);
        
        // Set default created_by
        if (!profile.created_by && profile.user_id) {
          profile.created_by = profile.user_id;
        }
        
        // Set default preferences based on user type
        if (!profile.search_preferences) {
          profile.search_preferences = {
            preferred_areas: [],
            budget_range: { min: 0, max: 0 },
            property_types: []
          };
        }
        
        if (!profile.notification_settings) {
          profile.notification_settings = {
            email_alerts: true,
            new_listings: true,
            price_drops: true,
            weekly_digest: false
          };
        }
      },
      
      afterCreate: (profile, options) => {
        logger.info(`User profile created successfully: ID ${profile.id}, Type: ${profile.user_type}`);
      },
      
      beforeUpdate: (profile, options) => {
        if (profile.changed('verified')) {
          logger.info(`User profile ${profile.id} verification status changed to: ${profile.verified}`);
        }
        
        if (profile.changed('user_type')) {
          logger.info(`User profile ${profile.id} type changed to: ${profile.user_type}`);
        }
      }
    }
  });
  
  return UserProfile;
};