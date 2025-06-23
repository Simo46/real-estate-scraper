'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Crea ENUM per user_type
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_user_profiles_user_type" AS ENUM (
        'buyer', 'agent', 'admin'
      );
    `);

    // Crea la tabella user_profiles per dati Real Estate
    await queryInterface.createTable('user_profiles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true, // One-to-One relationship
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'tenants',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      
      // === REAL ESTATE SPECIFIC DATA ===
      
      user_type: {
        type: Sequelize.ENUM('buyer', 'agent', 'admin'),
        allowNull: false,
        defaultValue: 'buyer',
        comment: 'Tipo utente per contesto real estate'
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Numero telefono per contatti real estate'
      },
      bio: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Biografia/descrizione per agent'
      },
      license_number: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Numero licenza per agenti immobiliari'
      },
      agency_name: {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: 'Nome agenzia di appartenenza'
      },
      
      // === PREFERENCES (JSONB) ===
      
      search_preferences: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {
          preferred_areas: [],
          budget_range: { min: 0, max: 0 },
          property_types: []
        },
        comment: 'Preferenze di ricerca per buyer'
      },
      notification_settings: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {
          email_alerts: true,
          new_listings: true,
          price_drops: true,
          weekly_digest: false
        },
        comment: 'Impostazioni notifiche'
      },
      agent_settings: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Impostazioni specifiche per agent (aree di competenza, commissioni, etc.)'
      },
      
      // === STATUS ===
      
      verified: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Profile verificato (importante per agent)'
      },
      public_profile: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Profilo pubblico visibile agli altri utenti'
      },
      
      // === AUDIT TRAIL ===
      
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Aggiungi indici per performance
    
    // Indice per user lookup (One-to-One)
    await queryInterface.addIndex('user_profiles', ['user_id'], {
      name: 'idx_user_profiles_user_id',
      unique: true
    });
    
    // Indice per tenant isolation
    await queryInterface.addIndex('user_profiles', ['tenant_id'], {
      name: 'idx_user_profiles_tenant_id'
    });
    
    // Indice per tipo utente (query comuni)
    await queryInterface.addIndex('user_profiles', ['user_type'], {
      name: 'idx_user_profiles_user_type'
    });
    
    // Indice per agent verificati
    await queryInterface.addIndex('user_profiles', ['user_type', 'verified'], {
      name: 'idx_user_profiles_verified_agents'
    });
    
    // Indice per profili pubblici
    await queryInterface.addIndex('user_profiles', ['public_profile', 'user_type'], {
      name: 'idx_user_profiles_public'
    });
    
    // Indice per soft delete
    await queryInterface.addIndex('user_profiles', ['deleted_at'], {
      name: 'idx_user_profiles_deleted_at'
    });
    
    // Indici per audit trail
    await queryInterface.addIndex('user_profiles', ['created_by'], {
      name: 'idx_user_profiles_created_by'
    });

    // Aggiungi constraints
    
    // Check constraint per phone format
    await queryInterface.addConstraint('user_profiles', {
      fields: ['phone'],
      type: 'check',
      name: 'chk_user_profiles_phone_format',
      where: {
        [Sequelize.Op.or]: [
          { phone: null },
          { phone: { [Sequelize.Op.regexp]: '^[\\+]?[\\d\\s\\-\\(\\)]{8,20}$' } }
        ]
      }
    });

    console.log('✅ User profiles table created successfully with all indexes and constraints');
  },

  async down(queryInterface, Sequelize) {
    // Rimuovi la tabella
    await queryInterface.dropTable('user_profiles');
    
    // Rimuovi il tipo ENUM
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_user_profiles_user_type";');

    console.log('✅ User profiles table dropped successfully');
  }
};