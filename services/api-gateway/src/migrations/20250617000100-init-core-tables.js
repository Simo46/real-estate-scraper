// MIGRATION UNIFICATA: crea tenants, users, roles, abilities, user_roles, user_abilities
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Tenants
    await queryInterface.createTable('tenants', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      domain: { type: Sequelize.STRING, allowNull: false, unique: true },
      code: { type: Sequelize.STRING, allowNull: false, unique: true },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      settings: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // Users
    await queryInterface.createTable('users', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      tenant_id: { type: Sequelize.UUID, references: { model: 'tenants', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL', allowNull: true },
      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      username: { type: Sequelize.STRING, allowNull: false, unique: true },
      email_verified_at: { type: Sequelize.DATE, allowNull: true },
      password: { type: Sequelize.STRING, allowNull: false },
      active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // Roles
    await queryInterface.createTable('roles', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      description: { type: Sequelize.STRING, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      deleted_at: { type: Sequelize.DATE, allowNull: true }
    });

    // Abilities
    await queryInterface.createTable('abilities', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      role_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'roles', key: 'id' } },
      action: { type: Sequelize.STRING, allowNull: false },
      subject: { type: Sequelize.STRING, allowNull: false },
      conditions: { type: Sequelize.JSONB, allowNull: true },
      inverted: { type: Sequelize.BOOLEAN, defaultValue: false },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // UserRoles
    await queryInterface.createTable('user_roles', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      role_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'roles', key: 'id' } },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // UserAbilities
    await queryInterface.createTable('user_abilities', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      tenant_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tenants', key: 'id' } },
      action: { type: Sequelize.STRING, allowNull: false },
      subject: { type: Sequelize.STRING, allowNull: false },
      conditions: { type: Sequelize.JSONB, allowNull: true },
      inverted: { type: Sequelize.BOOLEAN, defaultValue: false },
      role_context_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'roles', key: 'id' } },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // Indici principali
    await queryInterface.addIndex('roles', ['name'], { unique: true });
    await queryInterface.addIndex('users', ['email'], { unique: true });
    await queryInterface.addIndex('users', ['username'], { unique: true });
    await queryInterface.addIndex('user_abilities', ['user_id', 'role_context_id'], { name: 'idx_user_abilities_user_role_context' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('user_abilities');
    await queryInterface.dropTable('user_roles');
    await queryInterface.dropTable('abilities');
    await queryInterface.dropTable('roles');
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('tenants');
  }
};
