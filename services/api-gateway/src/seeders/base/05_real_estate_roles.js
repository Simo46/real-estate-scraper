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

    // Definisci le abilities per ogni ruolo
    const abilities = [
      // === REAL ESTATE AGENT ABILITIES ===
      {
        id: uuidv4(),
        role_id: realEstateAgentRoleId,
        action: 'manage',
        subject: 'SavedSearch',
        conditions: '{"user_id": "${user.id}"}', // Solo le proprie ricerche
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
        conditions: '{"savedSearch.user_id": "${user.id}"}', // Solo risultati delle proprie ricerche
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
        conditions: '{"savedSearch.user_id": "${user.id}"}', // Solo esecuzioni delle proprie ricerche
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
        subject: 'User',
        conditions: '{"id": "${user.id}"}', // Solo il proprio profilo
        fields: '["id", "name", "email", "username"]',
        inverted: false,
        priority: 10,
        created_at: now,
        updated_at: now
      },

      // === BUYER ABILITIES ===
      {
        id: uuidv4(),
        role_id: buyerRoleId,
        action: 'manage',
        subject: 'SavedSearch',
        conditions: '{"user_id": "${user.id}"}', // Solo le proprie ricerche
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
        conditions: '{"savedSearch.user_id": "${user.id}"}', // Solo risultati delle proprie ricerche
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
        conditions: '{"savedSearch.user_id": "${user.id}"}', // Solo esecuzioni delle proprie ricerche
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
        conditions: '{"id": "${user.id}"}', // Solo il proprio profilo
        fields: '["id", "name", "email", "username"]',
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
        conditions: '{}', // Tutte le ricerche del tenant
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
        conditions: '{}', // Tutti i risultati del tenant
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
        conditions: '{}', // Tutte le esecuzioni del tenant
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
        conditions: '{}', // Tutti gli utenti del tenant
        fields: '["id", "name", "email", "username", "active", "created_at", "updated_at"]',
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
        conditions: '{}', // Tutti gli utenti del tenant
        fields: '["name", "email", "active"]',
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
        conditions: '{}', // Può creare utenti nel tenant
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
        conditions: '{}', // Tutti i profili del tenant
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
    console.log(`   - RealEstateAgent: ${realEstateAgentRoleId}`);
    console.log(`   - Buyer: ${buyerRoleId}`);
    console.log(`   - AgencyAdmin: ${agencyAdminRoleId}`);
  },

  async down(queryInterface, Sequelize) {
    // Rimuovi abilities per i ruoli real estate
    await queryInterface.bulkDelete('abilities', {
      role_id: {
        [Sequelize.Op.in]: [
          queryInterface.sequelize.literal(`(SELECT id FROM roles WHERE name IN ('RealEstateAgent', 'Buyer', 'AgencyAdmin'))`)
        ]
      }
    });

    // Rimuovi i ruoli real estate
    await queryInterface.bulkDelete('roles', {
      name: {
        [Sequelize.Op.in]: ['RealEstateAgent', 'Buyer', 'AgencyAdmin']
      }
    });

    console.log('✅ Real Estate roles and abilities removed');
  }
};