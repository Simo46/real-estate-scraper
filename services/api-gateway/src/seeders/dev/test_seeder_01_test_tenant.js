'use strict';

/**
 * TEST SEEDER: Tenant di test per ambiente di sviluppo
 * Crea tenant semplici per testare funzionalità multi-tenant
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('[TEST-01] Creazione tenant di test...');
      
      // Tenant principale per i test
      const [existingMainTenant] = await queryInterface.sequelize.query(
        `SELECT id FROM tenants WHERE code = 'TEST'`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      if (!existingMainTenant) {
        await queryInterface.bulkInsert('tenants', [{
          id: Sequelize.literal('gen_random_uuid()'),
          name: 'Real Estate Scraper - Test Environment',
          domain: 'test.real-estate-scraper.local',
          code: 'TEST',
          active: true,
          settings: JSON.stringify({
            features: {
              scraping: true,
              ai_analysis: true,
              email_notifications: false,
              advanced_search: true,
              property_alerts: true
            },
            limits: {
              max_searches_per_day: 100,
              max_properties_tracked: 1000,
              max_alerts_per_user: 10
            },
            ui_config: {
              theme: 'light',
              language: 'it',
              currency: 'EUR'
            },
            scraping_config: {
              sites_enabled: ['idealista', 'casa.it', 'immobiliare.it'],
              update_frequency: '1h',
              max_pages_per_site: 50
            }
          }),
          created_at: new Date(),
          updated_at: new Date()
        }], {});
        
        console.log('[TEST-01] ✅ Tenant principale di test creato (TEST)');
      } else {
        console.log('[TEST-01] Tenant principale già esistente, skip');
      }
      
      // Tenant secondario per test isolamento multi-tenant
      const [existingSecondTenant] = await queryInterface.sequelize.query(
        `SELECT id FROM tenants WHERE code = 'TEST2'`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      if (!existingSecondTenant) {
        await queryInterface.bulkInsert('tenants', [{
          id: Sequelize.literal('gen_random_uuid()'),
          name: 'Secondary Test Tenant',
          domain: 'test2.real-estate-scraper.local',
          code: 'TEST2',
          active: true,
          settings: JSON.stringify({
            features: {
              scraping: false, // Limitato per test
              ai_analysis: true,
              email_notifications: true,
              advanced_search: false,
              property_alerts: true
            },
            limits: {
              max_searches_per_day: 50,
              max_properties_tracked: 500,
              max_alerts_per_user: 5
            },
            ui_config: {
              theme: 'dark',
              language: 'en',
              currency: 'USD'
            },
            scraping_config: {
              sites_enabled: ['idealista'], // Solo un sito
              update_frequency: '6h',
              max_pages_per_site: 20
            }
          }),
          created_at: new Date(),
          updated_at: new Date()
        }], {});
        
        console.log('[TEST-01] ✅ Tenant secondario di test creato (TEST2)');
      } else {
        console.log('[TEST-01] Tenant secondario già esistente, skip');
      }
      
      console.log('[TEST-01] ✅ Tenants di test configurati con successo');
      
    } catch (error) {
      console.error('[TEST-01] ❌ Errore durante creazione tenants di test:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('[TEST-01] Rimozione tenants di test...');
      
      // Prima rimuovi eventuali utenti associati ai tenant di test
      await queryInterface.sequelize.query(`
        DELETE FROM user_roles WHERE user_id IN (
          SELECT id FROM users WHERE tenant_id IN (
            SELECT id FROM tenants WHERE code IN ('TEST', 'TEST2')
          )
        )
      `);
      
      await queryInterface.sequelize.query(`
        DELETE FROM user_abilities WHERE tenant_id IN (
          SELECT id FROM tenants WHERE code IN ('TEST', 'TEST2')
        )
      `);
      
      await queryInterface.sequelize.query(`
        DELETE FROM users WHERE tenant_id IN (
          SELECT id FROM tenants WHERE code IN ('TEST', 'TEST2')
        )
      `);
      
      // Poi rimuovi i tenant
      await queryInterface.bulkDelete('tenants', {
        code: ['TEST', 'TEST2']
      });
      
      console.log('[TEST-01] ✅ Tenants di test rimossi');
      
    } catch (error) {
      console.error('[TEST-01] ❌ Errore durante rimozione tenants di test:', error);
      throw error;
    }
  }
};