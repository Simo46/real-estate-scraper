'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Indici di unicità
    await queryInterface.addIndex('tenants', ['domain'], { unique: true, name: 'idx_tenants_domain_unique' });
    await queryInterface.addIndex('tenants', ['code'], { unique: true, name: 'idx_tenants_code_unique' });
    await queryInterface.addIndex('roles', ['name'], { unique: true, name: 'idx_roles_name_unique' });
    await queryInterface.addIndex('users', ['email'], { unique: true, name: 'idx_users_email_unique' });
    await queryInterface.addIndex('users', ['username'], { unique: true, name: 'idx_users_username_unique' });
    
    // Indici per foreign keys e query frequenti
    await queryInterface.addIndex('users', ['tenant_id'], { name: 'idx_users_tenant_id' });
    await queryInterface.addIndex('abilities', ['role_id'], { name: 'idx_abilities_role_id' });
    await queryInterface.addIndex('abilities', ['action', 'subject'], { name: 'idx_abilities_action_subject' });
    await queryInterface.addIndex('user_roles', ['user_id'], { name: 'idx_user_roles_user_id' });
    await queryInterface.addIndex('user_roles', ['role_id'], { name: 'idx_user_roles_role_id' });
    await queryInterface.addIndex('user_roles', ['user_id', 'role_id'], { unique: true, name: 'idx_user_roles_user_role_unique' });
    await queryInterface.addIndex('user_abilities', ['user_id'], { name: 'idx_user_abilities_user_id' });
    await queryInterface.addIndex('user_abilities', ['tenant_id'], { name: 'idx_user_abilities_tenant_id' });
    await queryInterface.addIndex('user_abilities', ['user_id', 'role_context_id'], { name: 'idx_user_abilities_user_role_context' });
    await queryInterface.addIndex('user_abilities', ['action', 'subject'], { name: 'idx_user_abilities_action_subject' });
    
    // Indici per soft delete (performance su query attive)
    await queryInterface.addIndex('tenants', ['deleted_at'], { name: 'idx_tenants_deleted_at' });
    await queryInterface.addIndex('users', ['deleted_at'], { name: 'idx_users_deleted_at' });
    await queryInterface.addIndex('roles', ['deleted_at'], { name: 'idx_roles_deleted_at' });
    await queryInterface.addIndex('abilities', ['deleted_at'], { name: 'idx_abilities_deleted_at' });
    await queryInterface.addIndex('user_roles', ['deleted_at'], { name: 'idx_user_roles_deleted_at' });
    await queryInterface.addIndex('user_abilities', ['deleted_at'], { name: 'idx_user_abilities_deleted_at' });
    // Aggiungi i partial indexes per soft delete:
    await queryInterface.addIndex('users', ['email'], { 
      unique: true, 
      name: 'uk_users_email_active',
      where: { deleted_at: null }
    });
    
    // Indici per audit trail
    await queryInterface.addIndex('users', ['created_by'], { name: 'idx_users_created_by' });
    await queryInterface.addIndex('users', ['updated_by'], { name: 'idx_users_updated_by' });
  },

  async down (queryInterface, Sequelize) {
    // Rimuovi indici per audit trail
    await queryInterface.removeIndex('users', 'idx_users_updated_by');
    await queryInterface.removeIndex('users', 'idx_users_created_by');
    
    // Rimuovi indici per soft delete
    await queryInterface.removeIndex('user_abilities', 'idx_user_abilities_deleted_at');
    await queryInterface.removeIndex('user_roles', 'idx_user_roles_deleted_at');
    await queryInterface.removeIndex('abilities', 'idx_abilities_deleted_at');
    await queryInterface.removeIndex('roles', 'idx_roles_deleted_at');
    await queryInterface.removeIndex('users', 'idx_users_deleted_at');
    await queryInterface.removeIndex('tenants', 'idx_tenants_deleted_at');
    
    // Rimuovi indici per foreign keys e query frequenti
    await queryInterface.removeIndex('user_abilities', 'idx_user_abilities_action_subject');
    await queryInterface.removeIndex('user_abilities', 'idx_user_abilities_user_role_context');
    await queryInterface.removeIndex('user_abilities', 'idx_user_abilities_tenant_id');
    await queryInterface.removeIndex('user_abilities', 'idx_user_abilities_user_id');
    await queryInterface.removeIndex('user_roles', 'idx_user_roles_user_role_unique');
    await queryInterface.removeIndex('user_roles', 'idx_user_roles_role_id');
    await queryInterface.removeIndex('user_roles', 'idx_user_roles_user_id');
    await queryInterface.removeIndex('abilities', 'idx_abilities_action_subject');
    await queryInterface.removeIndex('abilities', 'idx_abilities_role_id');
    await queryInterface.removeIndex('users', 'idx_users_tenant_id');
    
    // Rimuovi indici di unicità
    await queryInterface.removeIndex('users', 'idx_users_username_unique');
    await queryInterface.removeIndex('users', 'idx_users_email_unique');
    await queryInterface.removeIndex('roles', 'idx_roles_name_unique');
    await queryInterface.removeIndex('tenants', 'idx_tenants_code_unique');
    await queryInterface.removeIndex('tenants', 'idx_tenants_domain_unique');
  }
};
