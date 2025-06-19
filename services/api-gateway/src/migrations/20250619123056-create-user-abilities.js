'use strict';
const { Op } = require('sequelize');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('user_abilities', {
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
      tenant_id: { 
        type: Sequelize.UUID, 
        allowNull: false, 
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      action: { 
        type: Sequelize.STRING, 
        allowNull: false,
        comment: 'Azione permessa (create, read, update, delete, manage)'
      },
      subject: { 
        type: Sequelize.STRING, 
        allowNull: false,
        comment: 'Soggetto su cui si applica l\'azione (modello/entità)'
      },
      conditions: { 
        type: Sequelize.JSONB, 
        allowNull: true,
        comment: 'Condizioni aggiuntive (es. {filiale_id: user.filiale_id})'
      },
      fields: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        comment: 'Campi specifici su cui si applica l\'ability'
      },
      inverted: { 
        type: Sequelize.BOOLEAN, 
        allowNull: false, 
        defaultValue: false,
        comment: 'Se true, questa è una regola di negazione (cannot)'
      },
      role_context_id: { 
        type: Sequelize.UUID, 
        allowNull: true, 
        references: { model: 'roles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      priority: { 
        type: Sequelize.INTEGER, 
        allowNull: false, 
        defaultValue: 10,
        comment: 'Priorità del permesso (più alto ha la precedenza)' 
      },
      reason: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Motivo del permesso individuale'
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Data di scadenza del permesso individuale'
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

    
    // CHECK constraint per action
    await queryInterface.addConstraint('user_abilities', {
      fields: ['action'],
      type: 'check',
      name: 'chk_user_abilities_action_valid',
      where: {
        action: ['create', 'read', 'update', 'delete', 'manage']
      }
    });

    // CHECK constraint per priority
    await queryInterface.addConstraint('user_abilities', {
      fields: ['priority'],
      type: 'check',
      name: 'chk_user_abilities_priority_range',
      where: {
        priority: {
          [Op.between]: [1, 100]
        }
      }
    });

    // UNIQUE constraint
    await queryInterface.addConstraint('user_abilities', {
      fields: ['user_id', 'tenant_id', 'action', 'subject'],
      type: 'unique',
      name: 'uk_user_abilities_unique_permission'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('user_abilities');
  }
};
