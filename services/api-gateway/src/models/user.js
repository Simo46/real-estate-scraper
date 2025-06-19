'use strict';

const { Model } = require('sequelize');
const bcrypt = require('bcryptjs'); // Assicurati che bcryptjs sia installato
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:user');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      // Relazione con tenant
      User.belongsTo(models.Tenant, { 
        foreignKey: 'tenant_id', 
        as: 'tenant' 
      });
      
      // Relazione molti-a-molti con Role attraverso UserRole
      User.belongsToMany(models.Role, {
        through: 'user_roles',
        foreignKey: 'user_id',
        otherKey: 'role_id',
        as: 'roles'
      });

      // Relazione con le abilities individuali
      User.hasMany(models.UserAbility, {
        foreignKey: 'user_id',
        as: 'userAbilities'
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
  }
  
  User.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    tenant_id: {
      type: DataTypes.UUID,
      references: {
        model: 'tenants',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Il nome è obbligatorio'
        }
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: {
          msg: 'L\'indirizzo email non è valido'
        },
        notEmpty: {
          msg: 'L\'email è obbligatoria'
        }
      }
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: {
          msg: 'Il nome utente è obbligatorio'
        },
        len: {
          args: [3, 50],
          msg: 'Il nome utente deve essere compreso tra 3 e 50 caratteri'
        }
      }
    },
    email_verified_at: DataTypes.DATE,
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'La password è obbligatoria'
        }
      }
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    settings: DataTypes.JSONB,
    remember_token: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    underscored: true,
    paranoid: true, // Soft delete
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      }
    }
  });
  
  return User;
};