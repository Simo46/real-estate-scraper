'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { 
        type: Sequelize.UUID, 
        defaultValue: Sequelize.UUIDV4, 
        primaryKey: true, 
        allowNull: false 
      },
      tenant_id: { 
        type: Sequelize.UUID, 
        references: { model: 'tenants', key: 'id' }, 
        onUpdate: 'CASCADE', 
        onDelete: 'SET NULL', 
        allowNull: true 
      },
      name: { 
        type: Sequelize.STRING, 
        allowNull: false 
      },
      email: { 
        type: Sequelize.STRING, 
        allowNull: false, 
        unique: true 
      },
      username: { 
        type: Sequelize.STRING, 
        allowNull: false, 
        unique: true 
      },
      email_verified_at: { 
        type: Sequelize.DATE, 
        allowNull: true 
      },
      password: { 
        type: Sequelize.STRING, 
        allowNull: false 
      },
      active: { 
        type: Sequelize.BOOLEAN, 
        allowNull: false,
        defaultValue: true 
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      remember_token: {
        type: Sequelize.STRING,
        allowNull: true
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
    await queryInterface.dropTable('users');
  }
};
