'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Crea ENUM per execution_frequency
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_saved_searches_execution_frequency" AS ENUM (
        'manual', 'hourly', 'daily', 'weekly', 'monthly'
      );
    `);

    // Crea la tabella saved_searches
    await queryInterface.createTable('saved_searches', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
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
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      
      // === INFORMAZIONI RICERCA ===
      
      name: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      natural_language_query: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      structured_criteria: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      
      // === CONFIGURAZIONE ESECUZIONE ===
      
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      execution_frequency: {
        type: Sequelize.ENUM('manual', 'hourly', 'daily', 'weekly', 'monthly'),
        allowNull: false,
        defaultValue: 'manual'
      },
      last_executed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      execution_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      
      // === CONFIGURAZIONE NOTIFICHE ===
      
      notify_on_new_results: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      min_results_for_notification: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      last_notification_sent_at: {
        type: Sequelize.DATE,
        allowNull: true
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
    
    // Indice per user lookup
    await queryInterface.addIndex('saved_searches', ['user_id', 'is_active'], {
      name: 'idx_saved_searches_user'
    });
    
    // Indice per tenant isolation
    await queryInterface.addIndex('saved_searches', ['tenant_id'], {
      name: 'idx_saved_searches_tenant'
    });
    
    // Indice per esecuzioni automatiche
    await queryInterface.addIndex('saved_searches', ['is_active', 'execution_frequency', 'last_executed_at'], {
      name: 'idx_saved_searches_auto_execution'
    });
    
    // Indice per notifiche
    await queryInterface.addIndex('saved_searches', ['notify_on_new_results', 'last_notification_sent_at'], {
      name: 'idx_saved_searches_notifications'
    });
    
    // Indice per soft delete
    await queryInterface.addIndex('saved_searches', ['deleted_at'], {
      name: 'idx_saved_searches_deleted_at'
    });
    
    // Indici per audit trail
    await queryInterface.addIndex('saved_searches', ['created_by'], {
      name: 'idx_saved_searches_created_by'
    });
    
    await queryInterface.addIndex('saved_searches', ['updated_by'], {
      name: 'idx_saved_searches_updated_by'
    });

    // Aggiungi constraints
    
    // Check constraint per execution_count
    await queryInterface.addConstraint('saved_searches', {
      fields: ['execution_count'],
      type: 'check',
      name: 'chk_saved_searches_execution_count_positive',
      where: {
        execution_count: {
          [Sequelize.Op.gte]: 0
        }
      }
    });
    
    // Check constraint per min_results_for_notification
    await queryInterface.addConstraint('saved_searches', {
      fields: ['min_results_for_notification'],
      type: 'check',
      name: 'chk_saved_searches_min_results_range',
      where: {
        min_results_for_notification: {
          [Sequelize.Op.between]: [0, 100]
        }
      }
    });
    
    // Check constraint per name length
    await queryInterface.addConstraint('saved_searches', {
      fields: ['name'],
      type: 'check',
      name: 'chk_saved_searches_name_length',
      where: Sequelize.literal("LENGTH(name) >= 3")
    });

    console.log('✅ Saved searches table created successfully with all indexes and constraints');
  },

  async down(queryInterface, Sequelize) {
    // Rimuovi la tabella
    await queryInterface.dropTable('saved_searches');
    
    // Rimuovi il tipo ENUM
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_saved_searches_execution_frequency";');

    console.log('✅ Saved searches table dropped successfully');
  }
};