'use strict';

/**
 * BASE SEEDER: Utente di sistema
 * Crea l'utente system necessario per operazioni automatiche
 * ID fisso: 00000000-0000-0000-0000-000000000000
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('[BASE-01] Verifica utente di sistema...');
      
      // Controlla se l'utente system esiste già
      const [existingUser] = await queryInterface.sequelize.query(
        `SELECT id FROM users WHERE id = '00000000-0000-0000-0000-000000000000'`,
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      if (existingUser) {
        console.log('[BASE-01] ✅ Utente di sistema già esistente, skip');
        return;
      }
      
      // Crea l'utente di sistema
      await queryInterface.bulkInsert('users', [{
        id: '00000000-0000-0000-0000-000000000000',
        tenant_id: null, // Utente globale, non legato a tenant specifico
        name: 'System User',
        email: 'system@real-estate-scraper.local',
        username: 'system',
        password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password non utilizzabile
        active: true,
        email_verified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      }], {});
      
      console.log('[BASE-01] ✅ Utente di sistema creato con successo');
      
    } catch (error) {
      console.error('[BASE-01] ❌ Errore durante creazione utente di sistema:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('[BASE-01] Rimozione utente di sistema...');
      
      // Rimuovi prima eventuali relazioni user_roles
      await queryInterface.bulkDelete('user_roles', {
        user_id: '00000000-0000-0000-0000-000000000000'
      });
      
      // Rimuovi eventuali relazioni user_abilities
      await queryInterface.bulkDelete('user_abilities', {
        user_id: '00000000-0000-0000-0000-000000000000'
      });
      
      // Rimuovi l'utente
      await queryInterface.bulkDelete('users', {
        id: '00000000-0000-0000-0000-000000000000'
      });
      
      console.log('[BASE-01] ✅ Utente di sistema rimosso');
      
    } catch (error) {
      console.error('[BASE-01] ❌ Errore durante rimozione utente di sistema:', error);
      throw error;
    }
  }
};