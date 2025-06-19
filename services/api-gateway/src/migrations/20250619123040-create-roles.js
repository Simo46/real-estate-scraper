'use strict';
const { Op } = require('sequelize');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('roles', {
      id: { 
        type: Sequelize.UUID, 
        defaultValue: Sequelize.UUIDV4, 
        primaryKey: true, 
        allowNull: false 
      },
      name: { 
        type: Sequelize.STRING, 
        allowNull: false, 
        unique: true 
      },
      description: { 
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

    await queryInterface.addConstraint('roles', {
      fields: ['name'],
      type: 'check',
      name: 'chk_roles_name_length',
      where: {
        [Op.and]: [
          { name: { [Op.ne]: '' } },
          { name: { [Op.not]: null } }
        ]
      }
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('roles');
  }
};
