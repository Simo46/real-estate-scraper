'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { v4: uuidv4 } = require('uuid');
    
    // IDs fissi per i ruoli per poterli referenziare nelle abilities
    const realEstateAgentRoleId = uuidv4();
    const buyerRoleId = uuidv4();
    const agencyAdminRoleId = uuidv4();
    
    const now = new Date();
    
    // Inserisci i nuovi ruoli real estate
    await queryInterface.bulkInsert('roles', [
      {
        id: realEstateAgentRoleId,
        name: 'RealEstateAgent',
        description: 'Agente immobiliare - può gestire ricerche e utilizzare il sistema di scraping',
        created_at: now,
        updated_at: now
      },
      {
        id: buyerRoleId,
        name: 'Buyer',
        description: 'Compratore - può creare ricerche salvate e visualizzare risultati',
        created_at: now,
        updated_at: now
      },
      {
        id: agencyAdminRoleId,
        name: 'AgencyAdmin',
        description: 'Admin agenzia - gestisce utenti e ricerche del tenant',
        created_at: now,
        updated_at: now
      }
    ]);

    // 🔍 TROVA IL RUOLO SYSTEM ESISTENTE
    const [systemRole] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name = 'system'`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    
    if (!systemRole) {
      throw new Error('Ruolo system non trovato. Eseguire prima il seeder base-roles.');
    }

    // Definisci le abilities per ogni ruolo (inclusi UserProfile)
    const abilities = [
      // =================================================================
      // SYSTEM: Abilities MANCANTI per SearchExecution e SearchResult
      // =================================================================
      {
        id: uuidv4(),
        role_id: systemRole.id,
        action: 'manage',
        subject: 'SearchExecution',
        conditions: null,
        fields: null,
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: systemRole.id,
        action: 'manage',
        subject: 'SearchResult',
        conditions: null,
        fields: null,
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },

      // === REAL ESTATE AGENT ABILITIES ===
      {
        id: uuidv4(),
        role_id: realEstateAgentRoleId,
        action: 'manage',
        subject: 'SavedSearch',
        conditions: '{"user_id": "${user.id}"}',
        fields: null,
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: realEstateAgentRoleId,
        action: 'read',
        subject: 'SearchResult',
        conditions: '{"savedSearch.user_id": "${user.id}"}',
        fields: null,
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: realEstateAgentRoleId,
        action: 'read',
        subject: 'SearchExecution',
        conditions: '{"savedSearch.user_id": "${user.id}"}',
        fields: null,
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },
      // ✅ FIX: RealEstateAgent può leggere TUTTI gli utenti del tenant (informazioni base)
      {
        id: uuidv4(),
        role_id: realEstateAgentRoleId,
        action: 'read',
        subject: 'User',
        conditions: null, // ✅ TUTTI gli utenti del tenant (filtrato automaticamente da tenant_id)
        fields: '{"id", "name", "email", "username", "active", "created_at"}', // ✅ Sintassi PostgreSQL array corretta
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: realEstateAgentRoleId,
        action: 'read',
        subject: 'UserProfile',
        conditions: '{"public_profile": true}',
        fields: null, // Campi base consentiti
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: realEstateAgentRoleId,
        action: 'manage',
        subject: 'UserProfile',
        conditions: '{"user_id": "${user.id}"}',
        fields: null,
        inverted: false,
        priority: 15,
        created_at: now,
        updated_at: now
      },

      // === BUYER ABILITIES ===
      {
        id: uuidv4(),
        role_id: buyerRoleId,
        action: 'manage',
        subject: 'SavedSearch',
        conditions: '{"user_id": "${user.id}"}',
        fields: null,
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: buyerRoleId,
        action: 'read',
        subject: 'SearchResult',
        conditions: '{"savedSearch.user_id": "${user.id}"}',
        fields: null,
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: buyerRoleId,
        action: 'read',
        subject: 'SearchExecution',
        conditions: '{"savedSearch.user_id": "${user.id}"}',
        fields: null,
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: buyerRoleId,
        action: 'read',
        subject: 'User',
        conditions: '{"id": "${user.id}"}',
        fields: null, // Tutti i campi consentiti
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: buyerRoleId,
        action: 'manage',
        subject: 'UserProfile',
        conditions: '{"user_id": "${user.id}"}',
        fields: null,
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },

      // === AGENCY ADMIN ABILITIES ===
      {
        id: uuidv4(),
        role_id: agencyAdminRoleId,
        action: 'manage',
        subject: 'SavedSearch',
        conditions: null, // ✅ Può gestire tutte le ricerche del tenant
        fields: null,
        inverted: false,
        priority: 15,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: agencyAdminRoleId,
        action: 'read',
        subject: 'SearchResult',
        conditions: null, // ✅ Può leggere tutti i risultati del tenant
        fields: null,
        inverted: false,
        priority: 15,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: agencyAdminRoleId,
        action: 'read',
        subject: 'SearchExecution',
        conditions: null, // ✅ Può leggere tutte le esecuzioni del tenant
        fields: null,
        inverted: false,
        priority: 15,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: agencyAdminRoleId,
        action: 'read',
        subject: 'User',
        conditions: null, // ✅ Tenant isolation già applicata automaticamente
        fields: null, // Campi utente standard
        inverted: false,
        priority: 15,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: agencyAdminRoleId,
        action: 'update',
        subject: 'User',
        conditions: null, // ✅ Può aggiornare utenti del tenant
        fields: null, // Campi base per update
        inverted: false,
        priority: 15,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: agencyAdminRoleId,
        action: 'create',
        subject: 'User',
        conditions: null,
        fields: null,
        inverted: false,
        priority: 15,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        role_id: agencyAdminRoleId,
        action: 'manage',
        subject: 'UserProfile',
        conditions: null, // ✅ Può gestire tutti i profili del tenant
        fields: null,
        inverted: false,
        priority: 15,
        created_at: now,
        updated_at: now
      }
    ];

    // Inserisci tutte le abilities
    await queryInterface.bulkInsert('abilities', abilities);

    console.log('✅ Real Estate roles and abilities created successfully');
    console.log(`   - RealEstateAgent: ${realEstateAgentRoleId} (✅ FIXED: can read all tenant users)`);
    console.log(`   - Buyer: ${buyerRoleId}`);
    console.log(`   - AgencyAdmin: ${agencyAdminRoleId}`);
    console.log('✅ System role abilities for SearchExecution and SearchResult added');
    console.log('✅ UserProfile abilities included');
  },

  async down(queryInterface, Sequelize) {
    // 🔍 TROVA IL RUOLO SYSTEM ESISTENTE
    const [systemRole] = await queryInterface.sequelize.query(
      `SELECT id FROM roles WHERE name = 'system'`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    // Rimuovi abilities per SearchExecution e SearchResult del ruolo system
    if (systemRole) {
      await queryInterface.bulkDelete('abilities', {
        role_id: systemRole.id,
        subject: {
          [Sequelize.Op.in]: ['SearchExecution', 'SearchResult']
        }
      });
    }

    // Rimuovi abilities per i ruoli real estate
    await queryInterface.sequelize.query(`
      DELETE FROM abilities 
      WHERE role_id IN (
        SELECT id FROM roles WHERE name IN ('RealEstateAgent', 'Buyer', 'AgencyAdmin')
      )
    `);

    // Rimuovi i ruoli real estate
    await queryInterface.bulkDelete('roles', {
      name: {
        [Sequelize.Op.in]: ['RealEstateAgent', 'Buyer', 'AgencyAdmin']
      }
    });

    console.log('✅ Real Estate roles and abilities removed');
    console.log('✅ System SearchExecution/SearchResult abilities removed');
  }
};