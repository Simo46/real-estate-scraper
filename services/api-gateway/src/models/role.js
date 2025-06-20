'use strict';

const { Model } = require('sequelize');
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:role');

module.exports = (sequelize, DataTypes) => {
  class Role extends Model {
    static associate(models) {
      // Relazione molti-a-molti con User attraverso UserRole
      Role.belongsToMany(models.User, {
        through: models.UserRole,
        foreignKey: 'role_id',
        otherKey: 'user_id',
        as: 'users'
      });
      
      // Relazione con le abilità
      Role.hasMany(models.Ability, {
        foreignKey: 'role_id',
        as: 'abilities'
      });

      Role.belongsTo(models.User, {
        foreignKey: 'created_by',
        as: 'creator'
      });
      
      Role.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updater'
      });
    }

    // Metodo helper per verificare se ha una specifica ability
    hasAbility(action, subject) {
      if (!this.abilities) return false;
      return this.abilities.some(ability => 
        ability.action === action && ability.subject === subject
      );
    }
  }
  
  Role.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false  
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
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
    modelName: 'Role',
    tableName: 'roles',
    underscored: true,
    paranoid: true,     // Soft delete
    timestamps: true,   
    
    scopes: {
      withAbilities: {
        include: [{
          model: sequelize.models.Ability,
          as: 'abilities'
        }]
      },
      withUsers: {
        include: [{
          model: sequelize.models.User,
          as: 'users'
        }]
      }
    }
  });
  
  return Role;
};