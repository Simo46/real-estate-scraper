'use strict';

const policyBuilder = require('../services/policyBuilder');

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Carica i ruoli predefiniti
      await policyBuilder.seedDefaultRoles();

      console.log('Ruoli predefiniti caricati con successo');
      
      // Aggiungi un utente admin se non esiste già un admin
      const { User, Role, sequelize } = require('../models');
      
      // Controlla se esiste già un admin
      const adminRole = await Role.findOne({
        where: { name: 'Amministratore di Sistema' }
      });
      
      if (!adminRole) {
        console.log('Ruolo amministratore non trovato, impossibile creare utente admin');
        return;
      }
      
      // Controlla se esiste già un utente admin
      const adminExists = await User.findOne({
        where: { username: 'admin' }
      });
      
      if (!adminExists) {
        // Crea l'utente admin
        const adminUser = await User.create({
          name: 'Amministratore',
          email: 'admin@example.com',
          username: 'admin',
          password: 'admin123', // Verrà hashata tramite hook
          active: true
        });
        
        // Associa il ruolo di amministratore
        await sequelize.models.UserRole.create({
          user_id: adminUser.id,
          role_id: adminRole.id
        });
        
        console.log('Utente admin creato con successo');
      } else {
        console.log('Utente admin già esistente, nessuna azione necessaria');
      }
    } catch (error) {
      console.error('Errore durante il seeding dei ruoli:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      // Questo è un seeder di base, non dovrebbe essere rollback
      console.log('Non viene eseguito rollback per i ruoli di base del sistema');
    } catch (error) {
      console.error('Errore durante il rollback dei ruoli:', error);
      throw error;
    }
  }
};