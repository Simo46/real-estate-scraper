const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Tenant extends Model {
    static associate(models) {
      // Definire le associazioni se necessario
      // Es. Tenant.hasMany(models.User)
    }
  }

  Tenant.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    domain: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
    }
  }, {
    sequelize,
    modelName: 'Tenant',
    tableName: 'tenants',
    paranoid: true, // Implementa soft delete
    timestamps: true,
  });

  return Tenant;
};