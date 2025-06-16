'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Tabella dei ruoli
    await queryInterface.createTable('roles', {
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
      description: {
        type: Sequelize.STRING,
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

    // Indice unico per name
    await queryInterface.addIndex('roles', ['name'], {
      unique: true
    });
    // Indice che include deleted_at per query con soft delete
    await queryInterface.addIndex('roles', ['deleted_at']);

    // Tabella degli utenti-ruoli (relazione molti-a-molti)
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
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      role_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'roles',
          key: 'id'
        },
        onDelete: 'CASCADE'
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

    // Indice unico per user_id + role_id
    await queryInterface.addIndex('user_roles', ['user_id', 'role_id'], {
      unique: true
    });
    // Indice che include deleted_at per query con soft delete
    await queryInterface.addIndex('user_roles', ['deleted_at']);

    // Tabella delle ability (regole di permesso)
    await queryInterface.createTable('abilities', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      role_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'roles',
          key: 'id'
        },
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
        comment: 'Condizioni aggiuntive (es. {ownerId: userId} o {status: "active"})'
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
      reason: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Motivo della regola, utile per debug e documentazione'
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

    // Indice per role_id
    await queryInterface.addIndex('abilities', ['role_id']);
    // Indice per ricerche frequenti
    await queryInterface.addIndex('abilities', ['action', 'subject']);
    // Indice che include deleted_at per query con soft delete
    await queryInterface.addIndex('abilities', ['deleted_at']); 
  },

  async down(queryInterface, Sequelize) {
    // Rimuovi le tabelle in ordine inverso
    await queryInterface.dropTable('abilities');
    await queryInterface.dropTable('user_roles');
    await queryInterface.dropTable('roles');
  }
};