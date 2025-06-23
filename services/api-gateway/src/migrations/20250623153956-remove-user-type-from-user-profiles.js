'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔧 Rimozione campo user_type da user_profiles...');
    
    // Rimuovi la colonna user_type se esistente
    try {
      await queryInterface.removeColumn('user_profiles', 'user_type');
      console.log('✅ Campo user_type rimosso con successo');
    } catch (error) {
      // Se la colonna non esiste, ignora l'errore
      if (error.message.includes('does not exist')) {
        console.log('ℹ️  Campo user_type non presente, nessuna azione necessaria');
      } else {
        throw error;
      }
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Ripristino campo user_type...');
    
    // Ripristina la colonna in caso di rollback
    await queryInterface.addColumn('user_profiles', 'user_type', {
      type: Sequelize.ENUM('buyer', 'agent', 'admin'),
      allowNull: true,
      comment: 'Tipo utente (derivato dai ruoli) - DEPRECATED'
    });
    
    console.log('✅ Campo user_type ripristinato (DEPRECATED)');
  }
};
