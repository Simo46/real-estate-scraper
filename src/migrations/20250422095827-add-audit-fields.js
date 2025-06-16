'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Lista delle tabelle principali che richiedono campi di audit
    const tables = [
      'abilities',
      'assets',
      'assets_history',
      'attrezzature',
      'categorie_attrezzature',
      'categorie_impianti_tecnologici',
      'categorie_strumenti_misura',
      'edifici',
      'edifici_history',
      'filiali',
      'filiali_history',
      'fornitori',
      'impianti_tecnologici',
      'locali',
      'locali_history',
      'piani',
      'piani_history',
      'roles',
      'stati_dotazione',
      'stati_interventi',
      'strumenti_di_misura',
      'tenants',
      'tipi_alimentazione',
      'tipi_possesso',
      'users',
      'user_roles'
    ];

    // Aggiungi i campi a ogni tabella
    for (const table of tables) {
      // Non aggiungiamo created_by alla tabella users per evitare riferimenti circolari iniziali
      // Questo può essere gestito successivamente se necessario
      if (table !== 'users') {
        await queryInterface.addColumn(table, 'created_by', {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        });
      }

      await queryInterface.addColumn(table, 'updated_by', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });

      // Aggiungi indici per migliorare le performance delle query filtrate per utente
      if (table !== 'users') {
        await queryInterface.addIndex(table, ['created_by']);
      }
      await queryInterface.addIndex(table, ['updated_by']);
    }
  },

  async down(queryInterface, Sequelize) {
    // Lista delle tabelle principali che richiedono campi di audit
    const tables = [
      'abilities',
      'assets',
      'assets_history',
      'attrezzature',
      'categorie_attrezzature',
      'categorie_impianti_tecnologici',
      'categorie_strumenti_misura',
      'edifici',
      'edifici_history',
      'filiali',
      'filiali_history',
      'fornitori',
      'impianti_tecnologici',
      'locali',
      'locali_history',
      'piani',
      'piani_history',
      'roles',
      'stati_dotazione',
      'stati_interventi',
      'strumenti_di_misura',
      'tenants',
      'tipi_alimentazione',
      'tipi_possesso',
      'users',
      'user_roles'
    ];

    // Rimuovi i campi da ogni tabella
    for (const table of tables) {
      if (table !== 'users') {
        await queryInterface.removeColumn(table, 'created_by');
      }
      await queryInterface.removeColumn(table, 'updated_by');
    }
  }
};