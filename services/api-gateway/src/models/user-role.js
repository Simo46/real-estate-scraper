'use strict';

const { Model } = require('sequelize');
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:user-role');

module.exports = (sequelize, DataTypes) => {
  class UserRole extends Model {
    static associate(models) {
      // Relazioni con User e Role
      UserRole.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user'
      });
      
      UserRole.belongsTo(models.Role, {
        foreignKey: 'role_id',
        as: 'role'
      });
    }
  }
  
  UserRole.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    role_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'UserRole',
    tableName: 'user_roles',
    underscored: true,
    paranoid: true, // Soft delete
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'role_id']
      }
    ]
  });
  
  return UserRole;
};