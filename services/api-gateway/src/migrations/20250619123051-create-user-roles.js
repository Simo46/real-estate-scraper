'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('user_roles', {
      id: { 
        type: Sequelize.UUID, 
        defaultValue: Sequelize.UUIDV4, 
        primaryKey: true, 
        allowNull: false 
      },
      user_id: { 
        type: Sequelize.UUID, 
        allowNull: false, 
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      role_id: { 
        type: Sequelize.UUID, 
        allowNull: false, 
        references: { model: 'roles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      // Audit fields
      created_by: { 
        type: Sequelize.UUID, 
        allowNull: true
      },
      updated_by: { 
        type: Sequelize.UUID, 
        allowNull: true
      },
      // Timestamps
      created_at: { 
        type: Sequelize.DATE, 
        allowNull: false, 
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') 
      },
      updated_at: { 
        type: Sequelize.DATE, 
        allowNull: false, 
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        onUpdate: Sequelize.literal('CURRENT_TIMESTAMP') 
      },
      // Soft delete
      deleted_at: { 
        type: Sequelize.DATE, 
        allowNull: true,
        comment: 'Campo per soft delete' 
      }
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('user_roles');
  }
};
