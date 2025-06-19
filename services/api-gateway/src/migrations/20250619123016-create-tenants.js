'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('tenants', {
      id: { 
        type: Sequelize.UUID, 
        defaultValue: Sequelize.UUIDV4, 
        primaryKey: true, 
        allowNull: false 
      },
      name: { 
        type: Sequelize.STRING, 
        allowNull: false 
      },
      domain: { 
        type: Sequelize.STRING, 
        allowNull: false, 
        unique: true 
      },
      code: { 
        type: Sequelize.STRING, 
        allowNull: false, 
        unique: true 
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
    await queryInterface.dropTable('tenants');
  }
};
