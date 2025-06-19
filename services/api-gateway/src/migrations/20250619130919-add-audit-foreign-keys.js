'use strict';

/**
 * MIGRATION: Aggiunge foreign key constraints per i campi di audit
 * Eseguita dopo la creazione di tutte le tabelle per evitare dipendenze circolari
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) { 
    // =================================================================
    // USERS - Audit FK (self-referencing)
    // =================================================================
    await queryInterface.addConstraint('users', {
      fields: ['created_by'],
      type: 'foreign key',
      name: 'fk_users_created_by',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    
    await queryInterface.addConstraint('users', {
      fields: ['updated_by'],
      type: 'foreign key',
      name: 'fk_users_updated_by',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    
    // =================================================================
    // ROLES - Audit FK
    // =================================================================
    await queryInterface.addConstraint('roles', {
      fields: ['created_by'],
      type: 'foreign key',
      name: 'fk_roles_created_by',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    
    await queryInterface.addConstraint('roles', {
      fields: ['updated_by'],
      type: 'foreign key',
      name: 'fk_roles_updated_by',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    
    // =================================================================
    // ABILITIES - Audit FK
    // =================================================================
    await queryInterface.addConstraint('abilities', {
      fields: ['created_by'],
      type: 'foreign key',
      name: 'fk_abilities_created_by',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    
    await queryInterface.addConstraint('abilities', {
      fields: ['updated_by'],
      type: 'foreign key',
      name: 'fk_abilities_updated_by',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    
    // =================================================================
    // USER_ROLES - Audit FK
    // =================================================================
    await queryInterface.addConstraint('user_roles', {
      fields: ['created_by'],
      type: 'foreign key',
      name: 'fk_user_roles_created_by',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    
    await queryInterface.addConstraint('user_roles', {
      fields: ['updated_by'],
      type: 'foreign key',
      name: 'fk_user_roles_updated_by',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    
    // =================================================================
    // USER_ABILITIES - Audit FK
    // =================================================================
    await queryInterface.addConstraint('user_abilities', {
      fields: ['created_by'],
      type: 'foreign key',
      name: 'fk_user_abilities_created_by',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    
    await queryInterface.addConstraint('user_abilities', {
      fields: ['updated_by'],
      type: 'foreign key',
      name: 'fk_user_abilities_updated_by',
      references: {
        table: 'users',
        field: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down (queryInterface, Sequelize) {    
    // Rimuovi tutti i constraint nell'ordine inverso
    const constraints = [
      { table: 'user_abilities', name: 'fk_user_abilities_updated_by' },
      { table: 'user_abilities', name: 'fk_user_abilities_created_by' },
      { table: 'user_roles', name: 'fk_user_roles_updated_by' },
      { table: 'user_roles', name: 'fk_user_roles_created_by' },
      { table: 'abilities', name: 'fk_abilities_updated_by' },
      { table: 'abilities', name: 'fk_abilities_created_by' },
      { table: 'roles', name: 'fk_roles_updated_by' },
      { table: 'roles', name: 'fk_roles_created_by' },
      { table: 'users', name: 'fk_users_updated_by' },
      { table: 'users', name: 'fk_users_created_by' }
    ];
    
    for (const constraint of constraints) {
      try {
        await queryInterface.removeConstraint(constraint.table, constraint.name);
      } catch (error) {
        console.log(`⚠️  Constraint ${constraint.name} su ${constraint.table} già rimosso o non esistente`);
      }
    }
    
    console.log('✅ Foreign key constraints per audit fields rimossi');
  }
};