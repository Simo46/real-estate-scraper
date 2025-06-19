'use strict';

const bcrypt = require('bcryptjs');

/**
 * BASE SEEDER: Utente amministratore iniziale  
 * Crea l'utente admin per la configurazione iniziale del sistema
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('[BASE-04] Creazione utente amministratore...');
      
      // Controlla se esiste già un admin
      const [existingAdmin] = await queryInterface.sequelize.query(
        `SELECT id FROM users WHERE username = 'admin'`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      if (existingAdmin) {
        console.log('[BASE-04] ✅ Utente admin già esistente, skip');
        return;
      }
      
      // Ottieni il ruolo admin
      const [adminRole] = await queryInterface.sequelize.query(
        `SELECT id FROM roles WHERE name = 'admin'`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      if (!adminRole) {
        throw new Error('Ruolo admin non trovato. Eseguire prima il seeder 02-base-roles.js');
      }
      
      // Hash della password admin (CAMBIARE IN PRODUZIONE!)
      console.log('[BASE-04] Generazione password hash...');
      const adminPassword = await bcrypt.hash('admin123', 10);
      
      // Crea l'utente admin
      const [newAdmin] = await queryInterface.sequelize.query(`
        INSERT INTO users (
          id, tenant_id, name, email, username, password, active, 
          email_verified_at, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(), NULL, :name, :email, :username, :password, :active,
          :emailVerified, NOW(), NOW()
        )
        RETURNING id
      `, {
        replacements: {
          name: 'Administrator',
          email: 'admin@real-estate-scraper.local',
          username: 'admin',
          password: adminPassword,
          active: true,
          emailVerified: new Date()
        },
        type: Sequelize.QueryTypes.INSERT
      });
      
      console.log(`[BASE-04] ✅ Utente admin creato con ID: ${newAdmin[0].id}`);
      
      // Associa il ruolo admin all'utente
      await queryInterface.bulkInsert('user_roles', [{
        id: Sequelize.literal('gen_random_uuid()'),
        user_id: newAdmin[0].id,
        role_id: adminRole.id,
        created_at: new Date()
      }], {});
      
      console.log('[BASE-04] ✅ Ruolo admin associato all\'utente');
      console.log('[BASE-04] 🔐 Credenziali create:');
      console.log('[BASE-04]    Username: admin');
      console.log('[BASE-04]    Password: admin123');
      console.log('[BASE-04]    Email: admin@real-estate-scraper.local');
      console.log('[BASE-04] ⚠️  IMPORTANTE: Cambiare la password in produzione!');
      
    } catch (error) {
      console.error('[BASE-04] ❌ Errore durante creazione utente amministratore:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('[BASE-04] Rimozione utente amministratore...');
      
      // Ottieni l'ID dell'utente admin
      const [adminUser] = await queryInterface.sequelize.query(
        `SELECT id FROM users WHERE username = 'admin'`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      if (adminUser) {
        // Rimuovi prima le associazioni user_roles
        await queryInterface.bulkDelete('user_roles', {
          user_id: adminUser.id
        });
        
        // Rimuovi eventuali user_abilities personalizzate
        await queryInterface.bulkDelete('user_abilities', {
          user_id: adminUser.id
        });
        
        // Rimuovi l'utente
        await queryInterface.bulkDelete('users', {
          id: adminUser.id
        });
        
        console.log('[BASE-04] ✅ Utente amministratore rimosso');
      } else {
        console.log('[BASE-04] Utente amministratore non trovato, skip');
      }
      
    } catch (error) {
      console.error('[BASE-04] ❌ Errore durante rimozione utente amministratore:', error);
      throw error;
    }
  }
};