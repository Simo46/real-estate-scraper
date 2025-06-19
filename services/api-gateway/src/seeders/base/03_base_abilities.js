'use strict';

/**
 * BASE SEEDER: Abilities (permessi) CASL fondamentali
 * Definisce i permessi base per admin, user e system nel contesto Real Estate Scraper
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('[BASE-03] Creazione abilities base...');
      
      // Ottieni gli ID dei ruoli
      const roles = await queryInterface.sequelize.query(
        `SELECT id, name FROM roles WHERE name IN ('admin', 'user', 'system')`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      if (roles.length !== 3) {
        throw new Error('Ruoli base non trovati. Eseguire prima il seeder 02-base-roles.js');
      }
      
      const roleMap = {};
      roles.forEach(role => {
        roleMap[role.name] = role.id;
      });
      
      // Definizione abilities base per Real Estate Scraper
      const baseAbilities = [
        // =================================================================
        // ADMIN: Accesso completo al sistema
        // =================================================================
        {
          role_id: roleMap.admin,
          action: 'manage',
          subject: 'all',
          conditions: null,
          inverted: false,
          priority: 1
        },
        
        // =================================================================
        // SYSTEM: Permessi per operazioni automatiche
        // =================================================================
        {
          role_id: roleMap.system,
          action: 'manage',
          subject: 'ScrapingJob',
          conditions: null,
          inverted: false,
          priority: 1
        },
        {
          role_id: roleMap.system,
          action: 'create',
          subject: 'Property',
          conditions: null,
          inverted: false,
          priority: 1
        },
        {
          role_id: roleMap.system,
          action: 'update',
          subject: 'Property',
          conditions: null,
          inverted: false,
          priority: 1
        },
        {
          role_id: roleMap.system,
          action: 'manage',
          subject: 'SystemOperation',
          conditions: null,
          inverted: false,
          priority: 1
        },
        
        // =================================================================
        // USER: Permessi per utenti standard
        // =================================================================
        
        // Gestione del proprio profilo
        {
          role_id: roleMap.user,
          action: 'read',
          subject: 'User',
          conditions: { id: '{{ user.id }}' },
          inverted: false,
          priority: 1
        },
        {
          role_id: roleMap.user,
          action: 'update',
          subject: 'User',
          conditions: { id: '{{ user.id }}' },
          inverted: false,
          priority: 1
        },
        
        // Lettura delle proprietà immobiliari (pubbliche)
        {
          role_id: roleMap.user,
          action: 'read',
          subject: 'Property',
          conditions: null,
          inverted: false,
          priority: 1
        },
        
        // Gestione delle proprie ricerche salvate
        {
          role_id: roleMap.user,
          action: 'create',
          subject: 'SearchQuery',
          conditions: null,
          inverted: false,
          priority: 1
        },
        {
          role_id: roleMap.user,
          action: 'read',
          subject: 'SearchQuery',
          conditions: { user_id: '{{ user.id }}' },
          inverted: false,
          priority: 1
        },
        {
          role_id: roleMap.user,
          action: 'update',
          subject: 'SearchQuery',
          conditions: { user_id: '{{ user.id }}' },
          inverted: false,
          priority: 1
        },
        {
          role_id: roleMap.user,
          action: 'delete',
          subject: 'SearchQuery',
          conditions: { user_id: '{{ user.id }}' },
          inverted: false,
          priority: 1
        },
        
        // Lettura dei job di scraping (solo status, non gestione)
        {
          role_id: roleMap.user,
          action: 'read',
          subject: 'ScrapingJob',
          conditions: null,
          inverted: false,
          priority: 1
        }
      ];
      
      // Inserisci le abilities controllando duplicati
      let createdCount = 0;
      let skippedCount = 0;
      
      for (const abilityData of baseAbilities) {
        // Controlla se l'ability esiste già
        const [existingAbility] = await queryInterface.sequelize.query(
          `SELECT id FROM abilities 
           WHERE role_id = :roleId AND action = :action AND subject = :subject`,
          {
            replacements: {
              roleId: abilityData.role_id,
              action: abilityData.action,
              subject: abilityData.subject
            },
            type: Sequelize.QueryTypes.SELECT
          }
        );
        
        if (!existingAbility) {
          await queryInterface.bulkInsert('abilities', [{
            id: Sequelize.literal('gen_random_uuid()'),
            role_id: abilityData.role_id,
            action: abilityData.action,
            subject: abilityData.subject,
            conditions: abilityData.conditions ? JSON.stringify(abilityData.conditions) : null,
            inverted: abilityData.inverted,
            priority: abilityData.priority,
            created_at: new Date(),
            updated_at: new Date()
          }], {});
          
          createdCount++;
        } else {
          skippedCount++;
        }
      }
      
      console.log(`[BASE-03] ✅ Abilities create: ${createdCount}, saltate: ${skippedCount}`);
      console.log('[BASE-03] ✅ Abilities base configurate con successo');
      
    } catch (error) {
      console.error('[BASE-03] ❌ Errore durante creazione abilities base:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('[BASE-03] Rimozione abilities base...');
      
      // Rimuovi tutte le abilities associate ai ruoli base
      await queryInterface.sequelize.query(`
        DELETE FROM abilities 
        WHERE role_id IN (
          SELECT id FROM roles WHERE name IN ('admin', 'user', 'system')
        )
      `);
      
      console.log('[BASE-03] ✅ Abilities base rimosse');
      
    } catch (error) {
      console.error('[BASE-03] ❌ Errore durante rimozione abilities base:', error);
      throw error;
    }
  }
};