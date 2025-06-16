'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_abilities', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        allowNull: false
      },
      tenant_id: {
        type: Sequelize.UUID,
        references: {
          model: 'tenants',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        allowNull: false
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
      created_by: {
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        allowNull: true
      },
      updated_by: {
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Campo per soft delete'
      }
    });

    // Indice per ricerca rapida sulle user_abilities
    await queryInterface.addIndex('user_abilities', ['user_id']);
    await queryInterface.addIndex('user_abilities', ['tenant_id']);
    await queryInterface.addIndex('user_abilities', ['action', 'subject']);
    // Indice per la data di scadenza per pulizia automatica
    await queryInterface.addIndex('user_abilities', ['expires_at']);
    // Indice che include deleted_at per query con soft delete
    await queryInterface.addIndex('user_abilities', ['deleted_at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('user_abilities');
  }
};