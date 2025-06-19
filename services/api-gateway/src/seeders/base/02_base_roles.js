'use strict';

/**
 * BASE SEEDER: Ruoli fondamentali del sistema
 * Crea i ruoli admin, user e system necessari per il funzionamento base
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('[BASE-02] Creazione ruoli base...');
      
      const baseRoles = [
        {
          name: 'admin',
          description: 'Amministratore del sistema con accesso completo'
        },
        {
          name: 'user', 
          description: 'Utente standard con permessi limitati'
        },
        {
          name: 'system',
          description: 'Ruolo per operazioni automatiche del sistema'
        }
      ];
      
      const createdRoles = {};
      
      // Crea i ruoli uno per volta per gestire duplicati
      for (const roleData of baseRoles) {
        const [existingRole] = await queryInterface.sequelize.query(
          `SELECT id FROM roles WHERE name = :name`,
          { 
            replacements: { name: roleData.name },
            type: Sequelize.QueryTypes.SELECT 
          }
        );
        
        if (existingRole) {
          console.log(`[BASE-02] Ruolo '${roleData.name}' già esistente, skip`);
          createdRoles[roleData.name] = existingRole.id;
        } else {
          const [newRole] = await queryInterface.sequelize.query(`
            INSERT INTO roles (id, name, description, created_at, updated_at)
            VALUES (gen_random_uuid(), :name, :description, NOW(), NOW())
            RETURNING id
          `, {
            replacements: {
              name: roleData.name,
              description: roleData.description
            },
            type: Sequelize.QueryTypes.INSERT
          });
          
          createdRoles[roleData.name] = newRole[0].id;
          console.log(`[BASE-02] ✅ Ruolo '${roleData.name}' creato`);
        }
      }
      
      // Associa il ruolo system all'utente system
      console.log('[BASE-02] Associazione ruolo system...');
      
      const [existingAssociation] = await queryInterface.sequelize.query(
        `SELECT id FROM user_roles 
         WHERE user_id = '00000000-0000-0000-0000-000000000000' 
         AND role_id = :roleId`,
        { 
          replacements: { roleId: createdRoles.system },
          type: Sequelize.QueryTypes.SELECT 
        }
      );
      
      if (!existingAssociation) {
        await queryInterface.bulkInsert('user_roles', [{
          id: Sequelize.literal('gen_random_uuid()'),
          user_id: '00000000-0000-0000-0000-000000000000',
          role_id: createdRoles.system,
          created_at: new Date()
        }], {});
        
        console.log('[BASE-02] ✅ Utente system associato al ruolo system');
      } else {
        console.log('[BASE-02] Associazione system-system già esistente, skip');
      }
      
      console.log('[BASE-02] ✅ Ruoli base configurati con successo');
      
    } catch (error) {
      console.error('[BASE-02] ❌ Errore durante creazione ruoli base:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('[BASE-02] Rimozione ruoli base...');
      
      // Rimuovi prima le associazioni user_roles
      await queryInterface.sequelize.query(`
        DELETE FROM user_roles 
        WHERE role_id IN (
          SELECT id FROM roles WHERE name IN ('admin', 'user', 'system')
        )
      `);
      
      // Rimuovi le abilities associate
      await queryInterface.sequelize.query(`
        DELETE FROM abilities 
        WHERE role_id IN (
          SELECT id FROM roles WHERE name IN ('admin', 'user', 'system')
        )
      `);
      
      // Rimuovi i ruoli
      await queryInterface.bulkDelete('roles', {
        name: ['admin', 'user', 'system']
      });
      
      console.log('[BASE-02] ✅ Ruoli base rimossi');
      
    } catch (error) {
      console.error('[BASE-02] ❌ Errore durante rimozione ruoli base:', error);
      throw error;
    }
  }
};