'use strict';

const { Model } = require('sequelize');
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:role');

module.exports = (sequelize, DataTypes) => {
  class Role extends Model {
    static associate(models) {
      // Relazione molti-a-molti con User attraverso UserRole
      Role.belongsToMany(models.User, {
        through: 'user_roles',
        foreignKey: 'role_id',
        otherKey: 'user_id',
        as: 'users'
      });
      
      // Relazione con le abilità
      Role.hasMany(models.Ability, {
        foreignKey: 'role_id',
        as: 'abilities'
      });
    }
  }
  
  Role.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: {
          msg: 'Il nome è obbligatorio'
        }
      }
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    }
  }, {
    sequelize,
    modelName: 'Role',
    tableName: 'roles',
    underscored: true,
    paranoid: true, // Soft delete
  });
  
  return Role;
};