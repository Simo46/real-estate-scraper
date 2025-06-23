'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Crea ENUM per source_platform
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_search_results_source_platform" AS ENUM (
        'immobiliare.it', 'casa.it', 'idealista.it', 'subito.it'
      );
    `);

    // Crea ENUM per status
    await queryInterface.sequelize.query(`
      CREATE TYPE "enum_search_results_status" AS ENUM (
        'active', 'unavailable', 'expired'
      );
    `);

    // Crea la tabella search_results
    await queryInterface.createTable('search_results', {
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
      search_execution_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'search_executions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      
      // === LINK TO ORIGINAL (NO COPYRIGHT VIOLATION) ===
      
      external_url: {
        type: Sequelize.STRING(1000),
        allowNull: false
      },
      source_platform: {
        type: Sequelize.ENUM('immobiliare.it', 'casa.it', 'idealista.it', 'subito.it'),
        allowNull: false
      },
      external_id: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      
      // === BASIC METADATA (MINIMAL INFO FOR REFERENCE) ===
      
      basic_title: {
        type: Sequelize.STRING(300),
        allowNull: true
      },
      basic_price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      basic_location: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      
      // === AI ANALYSIS (OUR VALUE-ADD) ===
      
      relevance_score: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.0
      },
      ai_insights: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      ai_summary: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      ai_recommendation: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      ai_processed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      
      // === TRACKING ===
      
      is_new_result: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      found_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      last_seen_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      
      // === STATUS TRACKING ===
      
      status: {
        type: Sequelize.ENUM('active', 'unavailable', 'expired'),
        allowNull: false,
        defaultValue: 'active'
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
    
    // Indice composito per ricerche per saved_search
    await queryInterface.addIndex('search_results', ['saved_search_id', 'found_at'], {
      name: 'idx_search_results_saved_search'
    });
    
    // Indice per search execution
    await queryInterface.addIndex('search_results', ['search_execution_id'], {
      name: 'idx_search_results_execution'
    });
    
    // Indice per tenant isolation
    await queryInterface.addIndex('search_results', ['tenant_id'], {
      name: 'idx_search_results_tenant'
    });
    
    // Indice per relevance scoring
    await queryInterface.addIndex('search_results', ['relevance_score', 'is_new_result'], {
      name: 'idx_search_results_relevance'
    });
    
    // Indice per deduplication
    await queryInterface.addIndex('search_results', ['source_platform', 'external_id'], {
      name: 'idx_search_results_external'
    });
    
    // Indice per AI processing
    await queryInterface.addIndex('search_results', ['ai_processed_at'], {
      name: 'idx_search_results_ai_processing'
    });
    
    // Indice per basic filtering
    await queryInterface.addIndex('search_results', ['basic_price', 'basic_location', 'status'], {
      name: 'idx_search_results_basic_filters'
    });
    
    // Indice per status tracking
    await queryInterface.addIndex('search_results', ['status', 'last_seen_at'], {
      name: 'idx_search_results_status'
    });
    
    // Indice per found_at (query temporali)
    await queryInterface.addIndex('search_results', ['found_at'], {
      name: 'idx_search_results_found_at'
    });

    // Aggiungi constraints
    
    // Check constraint per relevance_score range
    await queryInterface.addConstraint('search_results', {
      fields: ['relevance_score'],
      type: 'check',
      name: 'chk_search_results_relevance_score_range',
      where: {
        relevance_score: {
          [Sequelize.Op.between]: [0.0, 1.0]
        }
      }
    });
    
    // Check constraint per basic_price
    await queryInterface.addConstraint('search_results', {
      fields: ['basic_price'],
      type: 'check',
      name: 'chk_search_results_basic_price_positive',
      where: {
        [Sequelize.Op.or]: [
          { basic_price: null },
          { basic_price: { [Sequelize.Op.gt]: 0 } }
        ]
      }
    });
    
    // Check constraint per external_url format
    await queryInterface.addConstraint('search_results', {
      fields: ['external_url'],
      type: 'check',
      name: 'chk_search_results_external_url_length',
      where: Sequelize.literal("LENGTH(external_url) >= 10")
    });

    console.log('✅ Search results table created successfully with all indexes and constraints');
  },

  async down(queryInterface, Sequelize) {
    // Rimuovi la tabella
    await queryInterface.dropTable('search_results');
    
    // Rimuovi i tipi ENUM
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_search_results_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_search_results_source_platform";');

    console.log('✅ Search results table dropped successfully');
  }
};