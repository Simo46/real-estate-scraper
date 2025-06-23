'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Crea ENUM per execution_type
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_search_executions_execution_type" AS ENUM (
        'manual', 'automatic', 'scheduled'
      );
    `);

    // Crea ENUM per status
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_search_executions_status" AS ENUM (
        'pending', 'running', 'completed', 'failed', 'cancelled'
      );
    `);

    // Crea la tabella search_executions
    await queryInterface.createTable('search_executions', {
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
      saved_search_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'saved_searches',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      executed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      
      // === EXECUTION TRACKING ===
      
      execution_type: {
        type: Sequelize.ENUM('manual', 'automatic', 'scheduled'),
        allowNull: false,
        defaultValue: 'manual'
      },
      status: {
        type: Sequelize.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      execution_duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      
      // === SEARCH METADATA ===
      
      platforms_searched: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      search_criteria_snapshot: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      
      // === RESULTS SUMMARY ===
      
      total_results_found: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      new_results_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      
      // === ERROR TRACKING ===
      
      execution_errors: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      
      // === PERFORMANCE METRICS ===
      
      avg_response_time_ms: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      cache_hit_rate: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      
      // === TIMESTAMPS ===
      
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Aggiungi indici per performance
    
    // Indice per saved search lookup
    await queryInterface.addIndex('search_executions', ['saved_search_id', 'created_at'], {
      name: 'idx_search_executions_saved_search'
    });
    
    // Indice per tenant isolation
    await queryInterface.addIndex('search_executions', ['tenant_id'], {
      name: 'idx_search_executions_tenant'
    });
    
    // Indice per status monitoring
    await queryInterface.addIndex('search_executions', ['status', 'created_at'], {
      name: 'idx_search_executions_status'
    });
    
    // Indice per user executions
    await queryInterface.addIndex('search_executions', ['executed_by', 'created_at'], {
      name: 'idx_search_executions_user'
    });
    
    // Indice per performance queries
    await queryInterface.addIndex('search_executions', ['execution_type', 'status', 'execution_duration_ms'], {
      name: 'idx_search_executions_performance'
    });
    
    // Indice per esecuzioni automatiche
    await queryInterface.addIndex('search_executions', ['execution_type', 'status', 'started_at'], {
      name: 'idx_search_executions_automatic'
    });

    // Aggiungi constraints
    
    // Check constraint per execution_duration_ms
    await queryInterface.addConstraint('search_executions', {
      fields: ['execution_duration_ms'],
      type: 'check',
      name: 'chk_search_executions_duration_positive',
      where: {
        [Sequelize.Op.or]: [
          { execution_duration_ms: null },
          { execution_duration_ms: { [Sequelize.Op.gte]: 0 } }
        ]
      }
    });
    
    // Check constraint per total_results_found
    await queryInterface.addConstraint('search_executions', {
      fields: ['total_results_found'],
      type: 'check',
      name: 'chk_search_executions_results_positive',
      where: {
        total_results_found: { [Sequelize.Op.gte]: 0 }
      }
    });
    
    // Check constraint per new_results_count
    await queryInterface.addConstraint('search_executions', {
      fields: ['new_results_count'],
      type: 'check',
      name: 'chk_search_executions_new_results_positive',
      where: {
        new_results_count: { [Sequelize.Op.gte]: 0 }
      }
    });
    
    // Check constraint per cache_hit_rate
    await queryInterface.addConstraint('search_executions', {
      fields: ['cache_hit_rate'],
      type: 'check',
      name: 'chk_search_executions_cache_hit_rate_range',
      where: {
        [Sequelize.Op.or]: [
          { cache_hit_rate: null },
          {
            cache_hit_rate: {
              [Sequelize.Op.between]: [0, 1]
            }
          }
        ]
      }
    });

    console.log('✅ Search executions table created successfully with all indexes and constraints');
  },

  async down(queryInterface, Sequelize) {
    // Rimuovi la tabella
    await queryInterface.dropTable('search_executions');
    
    // Rimuovi i tipi ENUM
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_search_executions_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_search_executions_execution_type";');

    console.log('✅ Search executions table dropped successfully');
  }
};