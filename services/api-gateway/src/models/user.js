'use strict';

const { Model } = require('sequelize');
const bcrypt = require('bcryptjs');
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:user');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      // Relazione con tenant
      User.belongsTo(models.Tenant, { 
        foreignKey: 'tenant_id', 
        as: 'tenant',
        constraints: true,
        onDelete: 'RESTRICT' 
      });
      
      // Relazione molti-a-molti con Role attraverso UserRole
      User.belongsToMany(models.Role, {
        through: models.UserRole,
        foreignKey: 'user_id',
        otherKey: 'role_id',
        as: 'roles'
      });

      // Relazione con le abilities individuali
      User.hasMany(models.UserAbility, {
        foreignKey: 'user_id',
        as: 'userAbilities'
      });

      // Associazioni per audit fields (self-referencing)
      User.belongsTo(models.User, {
        foreignKey: 'created_by',
        as: 'creator'
      });
      
      User.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updater'
      });

      User.hasOne(models.UserProfile, {
        foreignKey: 'user_id',
        as: 'profile'
      });

      User.hasMany(models.SavedSearch, {
        foreignKey: 'user_id',
        as: 'savedSearches'
      });
    }
    
    // Verifica password
    async validPassword(password) {
      return await bcrypt.compare(password, this.password);
    }
    
    // Rimuovi dati sensibili per JSON
    toJSON() {
      const values = Object.assign({}, this.get());
      delete values.password;
      delete values.remember_token;
      return values;
    }
    
    // Controlla se l'utente ha un determinato ruolo
    hasRole(roleName) {
      if (!this.roles) return false;
      return this.roles.some(role => role.name === roleName);
    }
    
    // Controlla se l'utente ha uno dei ruoli specificati
    hasAnyRole(roleNames) {
      if (!this.roles) return false;
      return this.roles.some(role => roleNames.includes(role.name));
    }
    
    // Controlla se l'utente ha tutti i ruoli specificati
    hasAllRoles(roleNames) {
      if (!this.roles) return false;
      return roleNames.every(name => this.roles.some(role => role.name === name));
    }

    // Metodo helper per permessi
    async hasPermission(action, subject, conditions = {}) {
      const abilityService = require('../services/abilityService');
      const ability = await abilityService.defineAbilityFor(this);
      return ability.can(action, subject, conditions);
    }
  }
  
  User.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true,  // Dalla migration - per utenti legacy/sistema
      references: {
        model: 'tenants',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    email_verified_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    remember_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // Campi audit dalla migration
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
    modelName: 'User',
    tableName: 'users',
    underscored: true,
    paranoid: true, // Soft delete
    timestamps: true,
    
    // Scopes per query comuni
    scopes: {
      active: {
        where: { active: true }
      },
      withTenant: {
        include: [{
          model: sequelize.models.Tenant,
          as: 'tenant'
        }]
      },
      withRoles: {
        include: [{
          model: sequelize.models.Role,
          as: 'roles'
        }]
      },
      withoutSensitive: {
        attributes: { exclude: ['password', 'remember_token'] }
      }
    },
    
    // Solo hooks ESSENZIALI che devono sempre essere applicati
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      },
      // Hook per audit logging
      afterCreate: async (user, options) => {
        logger.info(`Nuovo utente creato: ${user.email} (${user.id})`);
      },
      afterUpdate: async (user, options) => {
        if (user.changed()) {
          logger.info(`Utente aggiornato: ${user.email} (${user.id})`);
        }
      }
    }
  });
  
  return User;
};