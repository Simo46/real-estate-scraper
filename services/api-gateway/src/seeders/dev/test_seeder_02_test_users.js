'use strict';

const bcrypt = require('bcryptjs');

/**
 * TEST SEEDER: Utenti di test per ambiente di sviluppo
 * Crea utenti diversificati per testare funzionalità e permessi
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('[TEST-02] Creazione utenti di test...');
      
      // Ottieni i tenant e ruoli necessari
      const tenants = await queryInterface.sequelize.query(
        `SELECT id, code FROM tenants WHERE code IN ('TEST', 'TEST2')`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      const roles = await queryInterface.sequelize.query(
        `SELECT id, name FROM roles WHERE name IN ('admin', 'user')`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      if (tenants.length === 0 || roles.length === 0) {
        console.log('[TEST-02] ⚠️  Prerequisiti mancanti (tenant/ruoli), skip utenti di test');
        return;
      }
      
      const tenantMap = {};
      tenants.forEach(tenant => {
        tenantMap[tenant.code] = tenant.id;
      });
      
      const roleMap = {};
      roles.forEach(role => {
        roleMap[role.name] = role.id;
      });
      
      // Password standard per tutti gli utenti di test
      console.log('[TEST-02] Generazione password hash...');
      const testPassword = await bcrypt.hash('password', 10);
      
      // Definizione utenti di test diversificati
      const testUsers = [
        // SVILUPPATORI
        {
          name: 'Developer User',
          email: 'dev@real-estate-scraper.local',
          username: 'dev1',
          password: testPassword,
          tenant_id: tenantMap.TEST,
          role: 'user'
        },
        {
          name: 'Senior Developer',
          email: 'senior.dev@real-estate-scraper.local',
          username: 'dev2',
          password: testPassword,
          tenant_id: tenantMap.TEST,
          role: 'admin'
        },
        
        // ADMIN DI TEST
        {
          name: 'Test Administrator',
          email: 'testadmin@real-estate-scraper.local',
          username: 'testadmin',
          password: testPassword,
          tenant_id: tenantMap.TEST,
          role: 'admin'
        },
        
        // UTENTI FINALI
        {
          name: 'Mario Rossi',
          email: 'mario.rossi@gmail.com',
          username: 'mario.rossi',
          password: testPassword,
          tenant_id: tenantMap.TEST,
          role: 'user'
        },
        {
          name: 'Laura Bianchi',
          email: 'laura.bianchi@yahoo.it',
          username: 'laura.bianchi',
          password: testPassword,
          tenant_id: tenantMap.TEST,
          role: 'user'
        },
        {
          name: 'Giuseppe Verdi',
          email: 'giuseppe.verdi@libero.it',
          username: 'giuseppe.verdi',
          password: testPassword,
          tenant_id: tenantMap.TEST,
          role: 'user'
        },
        
        // UTENTI PER TEST EDGE CASES
        {
          name: 'New User',
          email: 'newuser@test.local',
          username: 'newuser',
          password: testPassword,
          tenant_id: tenantMap.TEST,
          role: 'user'
        },
        {
          name: 'Power User',
          email: 'poweruser@test.local',
          username: 'poweruser',
          password: testPassword,
          tenant_id: tenantMap.TEST,
          role: 'user'
        }
      ];
      
      // Se esiste il tenant secondario, aggiungi utenti anche lì
      if (tenantMap.TEST2) {
        testUsers.push(
          {
            name: 'Tenant2 User',
            email: 'user@tenant2.local',
            username: 'tenant2user',
            password: testPassword,
            tenant_id: tenantMap.TEST2,
            role: 'user'
          },
          {
            name: 'Tenant2 Admin',
            email: 'admin@tenant2.local',
            username: 'tenant2admin',
            password: testPassword,
            tenant_id: tenantMap.TEST2,
            role: 'admin'
          }
        );
      }
      
      // Crea gli utenti
      let createdCount = 0;
      let skippedCount = 0;
      
      for (const userData of testUsers) {
        // Verifica se l'utente esiste già
        const [existingUser] = await queryInterface.sequelize.query(
          `SELECT id FROM users WHERE username = :username`,
          { 
            replacements: { username: userData.username },
            type: Sequelize.QueryTypes.SELECT 
          }
        );
        
        if (!existingUser) {
          // Crea l'utente
          const [newUser] = await queryInterface.sequelize.query(`
            INSERT INTO users (
              id, tenant_id, name, email, username, password, active, 
              email_verified_at, created_at, updated_at
            )
            VALUES (
              gen_random_uuid(), :tenantId, :name, :email, :username, :password, 
              :active, :emailVerified, NOW(), NOW()
            )
            RETURNING id
          `, {
            replacements: {
              tenantId: userData.tenant_id,
              name: userData.name,
              email: userData.email,
              username: userData.username,
              password: userData.password,
              active: true,
              emailVerified: new Date()
            },
            type: Sequelize.QueryTypes.INSERT
          });
          
          // Associa il ruolo
          await queryInterface.bulkInsert('user_roles', [{
            id: Sequelize.literal('gen_random_uuid()'),
            user_id: newUser[0].id,
            role_id: roleMap[userData.role],
            created_at: new Date()
          }], {});
          
          createdCount++;
          console.log(`[TEST-02] ✅ Utente '${userData.username}' creato (${userData.role})`);
        } else {
          skippedCount++;
          console.log(`[TEST-02] Utente '${userData.username}' già esistente, skip`);
        }
      }
      
      console.log(`[TEST-02] ✅ Utenti di test: ${createdCount} creati, ${skippedCount} saltati`);
      console.log('[TEST-02] 🔐 Password per tutti gli utenti di test: "password"');
      console.log('[TEST-02] 📋 Utenti disponibili per test:');
      console.log('[TEST-02]    • dev1, dev2 (sviluppatori)');
      console.log('[TEST-02]    • testadmin (admin di test)');
      console.log('[TEST-02]    • mario.rossi, laura.bianchi, giuseppe.verdi (utenti finali)');
      console.log('[TEST-02]    • newuser, poweruser (edge cases)');
      if (tenantMap.TEST2) {
        console.log('[TEST-02]    • tenant2user, tenant2admin (tenant secondario)');
      }
      
    } catch (error) {
      console.error('[TEST-02] ❌ Errore durante creazione utenti di test:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('[TEST-02] Rimozione utenti di test...');
      
      const testUsernames = [
        'dev1', 'dev2', 'testadmin', 'mario.rossi', 'laura.bianchi', 
        'giuseppe.verdi', 'newuser', 'poweruser', 'tenant2user', 'tenant2admin'
      ];
      
      // Ottieni gli ID degli utenti di test
      const testUsers = await queryInterface.sequelize.query(`
        SELECT id FROM users WHERE username IN (${testUsernames.map(() => '?').join(',')})
      `, { 
        replacements: testUsernames,
        type: Sequelize.QueryTypes.SELECT 
      });
      
      if (testUsers.length > 0) {
        const userIds = testUsers.map(user => user.id);
        
        // Rimuovi prima le associazioni user_roles
        await queryInterface.sequelize.query(`
          DELETE FROM user_roles WHERE user_id IN (${userIds.map(() => '?').join(',')})
        `, { replacements: userIds });
        
        // Rimuovi eventuali user_abilities
        await queryInterface.sequelize.query(`
          DELETE FROM user_abilities WHERE user_id IN (${userIds.map(() => '?').join(',')})
        `, { replacements: userIds });
        
        // Rimuovi gli utenti
        await queryInterface.bulkDelete('users', {
          username: testUsernames
        });
        
        console.log('[TEST-02] ✅ Utenti di test rimossi');
      } else {
        console.log('[TEST-02] Nessun utente di test trovato, skip');
      }
      
    } catch (error) {
      console.error('[TEST-02] ❌ Errore durante rimozione utenti di test:', error);
      throw error;
    }
  }
};