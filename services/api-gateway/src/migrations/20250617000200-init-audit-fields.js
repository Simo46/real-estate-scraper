// MIGRATION: aggiunge solo i campi di audit alle tabelle core
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Solo le tabelle core
    const tables = [
      'abilities',
      'roles',
      'tenants',
      'users',
      'user_roles',
      'user_abilities'
    ];
    for (const table of tables) {
      await queryInterface.addColumn(table, 'created_by', { type: Sequelize.UUID, allowNull: true });
      await queryInterface.addColumn(table, 'updated_by', { type: Sequelize.UUID, allowNull: true });
    }
  },
  async down(queryInterface, Sequelize) {
    const tables = [
      'abilities',
      'roles',
      'tenants',
      'users',
      'user_roles',
      'user_abilities'
    ];
    for (const table of tables) {
      await queryInterface.removeColumn(table, 'created_by');
      await queryInterface.removeColumn(table, 'updated_by');
    }
  }
};
