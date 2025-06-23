'use strict';

const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class UserProfile extends Model {
    static associate(models) {
      // Un UserProfile appartiene a un User
      UserProfile.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user',
        onDelete: 'CASCADE'
      });

      // Un UserProfile appartiene a un Tenant
      UserProfile.belongsTo(models.Tenant, {
        foreignKey: 'tenant_id',
        as: 'tenant'
      });
    }

    /**
     * Ottiene il tipo utente derivato dai ruoli dell'utente associato
     * @returns {Promise<string>} - 'admin', 'agent', 'buyer', 'user'
     */
    async getUserType() {
      const user = await this.getUser({ include: ['roles'] });
      return user ? user.getUserType() : 'user';
    }

    /**
     * Verifica se il profilo appartiene a un utente con un ruolo specifico
     * @param {string} roleName - Nome del ruolo
     * @returns {Promise<boolean>}
     */
    async hasUserRole(roleName) {
      const user = await this.getUser({ include: ['roles'] });
      return user ? user.hasRole(roleName) : false;
    }

    /**
     * Determina se il profilo dovrebbe essere pubblico in base al ruolo
     * @returns {Promise<boolean>}
     */
    async shouldBePublic() {
      const userType = await this.getUserType();
      // RealEstateAgent di default hanno profili pubblici
      return userType === 'agent' ? true : this.public_profile;
    }
  }

  UserProfile.init({
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
      },
      onDelete: 'CASCADE',
      unique: true // Un solo profilo per utente
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'tenants',
        key: 'id'
      }
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        is: /^[\+]?[1-9][\d]{0,15}$/ // Formato internazionale base
      }
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: [0, 1000]
      }
    },
    agency_name: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Nome agenzia per RealEstateAgent'
    },
    search_preferences: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Preferenze ricerca immobili'
    },
    notification_settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        email_alerts: true,
        new_listings: true,
        price_changes: false,
        saved_search_updates: true
      },
      comment: 'Impostazioni notifiche'
    },
    verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Profilo verificato da AgencyAdmin'
    },
    public_profile: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Profilo visibile ad altri utenti'
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
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'UserProfile',
    tableName: 'user_profiles',
    underscored: true,
    paranoid: true, // Soft delete
    timestamps: true,
    indexes: [
      {
        fields: ['user_id'],
        unique: true
      },
      {
        fields: ['tenant_id']
      },
      {
        fields: ['verified']
      },
      {
        fields: ['public_profile']
      }
    ]
  });

  return UserProfile;
};
