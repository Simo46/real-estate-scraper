// MIGRATION: inserisce ruoli base
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('roles', [
      { id: Sequelize.literal('gen_random_uuid()'), name: 'admin', description: 'Amministratore', created_at: new Date(), updated_at: new Date() },
      { id: Sequelize.literal('gen_random_uuid()'), name: 'user', description: 'Utente base', created_at: new Date(), updated_at: new Date() }
    ], {});
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('roles', { name: ['admin', 'user'] });
  }
};
