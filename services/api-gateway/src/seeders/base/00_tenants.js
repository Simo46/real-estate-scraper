'use strict';

const { v4: uuidv4 } = require('uuid');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('[BASE-00] Creazione tenant di sistema e default...');
    
    // Verifica se i tenant esistono già
    const existingTenants = await queryInterface.sequelize.query(
      "SELECT code FROM tenants WHERE code IN ('SYSTEM', 'DEFAULT') AND deleted_at IS NULL",
      { type: Sequelize.QueryTypes.SELECT }
    );
    
    const existingCodes = existingTenants.map(t => t.code);
    const tenantsToCreate = [];
    
    // Tenant di sistema per servizi interni (NLP, scraping, etc.)
    if (!existingCodes.includes('SYSTEM')) {
      tenantsToCreate.push({
        id: uuidv4(),
        name: 'System Services',
        domain: 'system.internal',
        code: 'SYSTEM',
        active: true,
        settings: JSON.stringify({
          description: 'Tenant di sistema per servizi interni come NLP, scraping automatico e tasks di background',
          limits: {
            max_alerts_per_user: 999999,
            max_searches_per_day: 999999,
            max_properties_tracked: 999999
          },
          features: {
            scraping: true,
            ai_analysis: true,
            advanced_search: true,
            property_alerts: true,
            email_notifications: true,
            system_access: true
          },
          ui_config: {
            theme: 'system',
            currency: 'EUR',
            language: 'it'
          },
          scraping_config: {
            sites_enabled: ['idealista', 'casa.it', 'immobiliare.it'],
            update_frequency: '30m',
            max_pages_per_site: 100
          }
        }),
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    
    // Tenant default per utenti normali
    if (!existingCodes.includes('DEFAULT')) {
      tenantsToCreate.push({
        id: uuidv4(),
        name: 'Default Tenant',
        domain: 'app.real-estate-scraper.local',
        code: 'DEFAULT',
        active: true,
        settings: JSON.stringify({
          description: 'Tenant di default per tutti gli utenti dell\'applicazione. Utilizzato quando non è specificato un tenant specifico.',
          limits: {
            max_alerts_per_user: 20,
            max_searches_per_day: 200,
            max_properties_tracked: 2000
          },
          features: {
            scraping: true,
            ai_analysis: true,
            advanced_search: true,
            property_alerts: true,
            email_notifications: true
          },
          ui_config: {
            theme: 'light',
            currency: 'EUR',
            language: 'it'
          },
          scraping_config: {
            sites_enabled: ['idealista', 'casa.it', 'immobiliare.it'],
            update_frequency: '1h',
            max_pages_per_site: 50
          }
        }),
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    
    if (tenantsToCreate.length > 0) {
      await queryInterface.bulkInsert('tenants', tenantsToCreate);
      console.log(`[BASE-00] ✅ Creati ${tenantsToCreate.length} tenant di sistema`);
      
      // Log dei tenant creati
      tenantsToCreate.forEach(tenant => {
        console.log(`[BASE-00] - ${tenant.code}: ${tenant.name} (${tenant.domain})`);
      });
    } else {
      console.log('[BASE-00] ✅ Tenant di sistema già esistenti, skip');
    }
    
    // Aggiungi commenti al database per documentare i tenant
    await queryInterface.sequelize.query(`
      COMMENT ON TABLE tenants IS 'Tabella dei tenant per il supporto multi-tenant dell''applicazione. Include tenant di sistema per servizi interni e tenant default per utenti normali.'
    `);
    
    console.log('[BASE-00] ✅ Tenant di sistema e default configurati con successo');
  },

  async down(queryInterface, Sequelize) {
    console.log('[BASE-00] Rimozione tenant di sistema e default...');
    
    await queryInterface.sequelize.query(`
      DELETE FROM tenants 
      WHERE code IN ('SYSTEM', 'DEFAULT') 
      AND deleted_at IS NULL
    `);
    
    console.log('[BASE-00] ✅ Tenant di sistema e default rimossi');
  }
};
