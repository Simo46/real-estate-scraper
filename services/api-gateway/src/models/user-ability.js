'use strict';

const { Model } = require('sequelize');
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:user-ability');

module.exports = (sequelize, DataTypes) => {
  class UserAbility extends Model {
    static associate(models) {
      // Relazione con utente
      UserAbility.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
      });
      
      // Relazione con tenant
      UserAbility.belongsTo(models.Tenant, {
        foreignKey: 'tenant_id',
        as: 'tenant'
      });
      
      // Relazione con il ruolo di contesto (opzionale)
      UserAbility.belongsTo(models.Role, {
        foreignKey: 'role_context_id',
        as: 'roleContext'
      });
      
      // Relazione con l'utente che ha creato il permesso
      UserAbility.belongsTo(models.User, {
        foreignKey: 'created_by',
        as: 'creator'
      });
      
      // Relazione con l'utente che ha aggiornato il permesso
      UserAbility.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updater'
      });
    }
    
    /**
     * Verifica se il permesso è scaduto
     * @returns {boolean} True se il permesso è scaduto
     */
    isExpired() {
      if (!this.expires_at) return false;
      return new Date(this.expires_at) < new Date();
    }

    /**
     * Verifica se il permesso si applica al ruolo attivo
     * @param {string} activeRoleId - ID del ruolo attivo dell'utente
     * @returns {boolean} True se il permesso si applica
     */
    appliesTo(activeRoleId) {
      // Se non ha role_context_id, si applica sempre (comportamento legacy)
      if (!this.role_context_id) return true;
      
      // Se ha role_context_id, deve corrispondere al ruolo attivo
      return this.role_context_id === activeRoleId;
    }

    /**
     * Restituisce la priorità effettiva del permesso
     * I permessi con contesto ruolo hanno priorità più alta di quelli globali
     * @returns {number} Priorità calcolata
     */
    getEffectivePriority() {
      let basePriority = this.priority || 10;
      
      // I permessi con contesto ruolo specifico hanno priorità più alta
      if (this.role_context_id) {
        basePriority += 10;
      }
      
      return basePriority;
    }
  }
  
  UserAbility.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false  
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
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
    role_context_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'roles',
        key: 'id'
      }
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false
    },
    conditions: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    fields: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true
    },
    inverted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10 
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
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
    modelName: 'UserAbility',
    tableName: 'user_abilities',
    underscored: true,
    paranoid: true,     // Soft delete
    timestamps: true  
  });
  
  return UserAbility;
};