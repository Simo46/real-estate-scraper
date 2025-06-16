'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Aggiungi role_context_id a user_abilities
    await queryInterface.addColumn('user_abilities', 'role_context_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'roles',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    
    // Aggiungi indice per performance
    await queryInterface.addIndex('user_abilities', ['role_context_id'], {
      name: 'idx_user_abilities_role_context'
    });
    
    // Aggiungi priority ad abilities per coerenza con user_abilities
    await queryInterface.addColumn('abilities', 'priority', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1
    });
    
    // Aggiungi indice composito per ottimizzazioni query
    await queryInterface.addIndex('user_abilities', ['user_id', 'role_context_id'], {
      name: 'idx_user_abilities_user_role_context'
    });
  },

  async down(queryInterface, Sequelize) {
    // Rimuovi indici
    await queryInterface.removeIndex('user_abilities', 'idx_user_abilities_role_context');
    await queryInterface.removeIndex('user_abilities', 'idx_user_abilities_user_role_context');
    
    // Rimuovi colonne
    await queryInterface.removeColumn('user_abilities', 'role_context_id');
    await queryInterface.removeColumn('abilities', 'priority');
  }
};