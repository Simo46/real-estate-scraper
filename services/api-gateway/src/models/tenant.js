const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Tenant extends Model {
    static associate(models) {
      Tenant.hasMany(models.User, {
        foreignKey: 'tenant_id',
        as: 'users'
      });
      
      Tenant.hasMany(models.UserAbility, {
        foreignKey: 'tenant_id',
        as: 'userAbilities'
      });
    }

    isActive() {
      return this.active;
    }

    // Metodo per ottenere setting specifico
    getSetting(key, defaultValue = null) {
      return this.settings && this.settings[key] !== undefined 
        ? this.settings[key] 
        : defaultValue;
    }

    // Metodo per impostare setting
    setSetting(key, value) {
      const settings = this.settings || {};
      settings[key] = value;
      this.settings = settings;
      return this.save();
    }
  }

  Tenant.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false 
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
      allowNull: false, 
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
    underscored: true,  
    paranoid: true,       // Soft delete
    timestamps: true,
    
    scopes: {
      active: {
        where: { active: true }
      },
      withUsers: {
        include: [{
          model: sequelize.models.User,
          as: 'users'
        }]
      }
    }
  });

  return Tenant;
};