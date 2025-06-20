'use strict';

const { Model } = require('sequelize');
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:ability');

module.exports = (sequelize, DataTypes) => {
  class Ability extends Model {
    static associate(models) {
      // Relazione con i ruoli
      Ability.belongsTo(models.Role, {
        foreignKey: 'role_id',
        as: 'role'
      });

      Ability.belongsTo(models.User, {
        foreignKey: 'created_by',
        as: 'creator'
      });
      
      Ability.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updater'
      });
    }
  }
  
  Ability.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false  
    },
    role_id: {
      type: DataTypes.UUID,
      allowNull: false,
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
      defaultValue: 1  
    },
    reason: {
      type: DataTypes.STRING,
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
    modelName: 'Ability',
    tableName: 'abilities',
    underscored: true,
    paranoid: true,     // Soft delete
    timestamps: true    
  });
  
  return Ability;
};