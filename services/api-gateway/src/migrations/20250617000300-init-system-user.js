// MIGRATION: crea utente di sistema e ruolo associato
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Inserisci utente di sistema
    await queryInterface.bulkInsert('users', [{
      id: '00000000-0000-0000-0000-000000000000',
      name: 'System User',
      email: 'system@example.com',
      username: 'system',
      password: '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // Password dummy
      active: true,
      created_at: new Date(),
      updated_at: new Date()
    }], {});

    // Crea ruolo di sistema
    const [systemRole] = await queryInterface.sequelize.query(
      `INSERT INTO roles (id, name, description, created_at, updated_at)
       VALUES (gen_random_uuid(), 'system', 'System role for automated operations', NOW(), NOW())
       RETURNING id`
    );

    // Associa ruolo all'utente di sistema
    if (systemRole && systemRole.length > 0) {
      await queryInterface.bulkInsert('user_roles', [{
        id: Sequelize.literal('gen_random_uuid()'),
        user_id: '00000000-0000-0000-0000-000000000000',
        role_id: systemRole[0].id,
        created_at: new Date(),
        updated_at: new Date()
      }], {});
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('user_roles', { user_id: '00000000-0000-0000-0000-000000000000' });
    await queryInterface.bulkDelete('roles', { name: 'system' });
    await queryInterface.bulkDelete('users', { id: '00000000-0000-0000-0000-000000000000' });
  }
};
