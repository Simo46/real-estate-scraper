'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Recuperiamo l'elenco di tutte le tabelle nel database, escludendo SequelizeMeta
      const [tables] = await queryInterface.sequelize.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'
           AND table_name != 'SequelizeMeta';`,
        { transaction }
      );

      // Per ogni tabella
      for (const tableRow of tables) {
        const tableName = tableRow.table_name;
        
        // Otteniamo le informazioni sulla colonna ID
        const [columns] = await queryInterface.sequelize.query(
          `SELECT column_name, data_type, column_default
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = '${tableName}'
             AND column_name = 'id'
             AND data_type = 'uuid';`,
          { transaction }
        );

        // Se esiste una colonna ID di tipo UUID
        if (columns.length > 0) {
          const column = columns[0];
          
          // Se non ha già un valore di default UUID
          if (!column.column_default || !column.column_default.includes('uuid')) {
            console.log(`Aggiungendo valore di default UUID alla colonna id della tabella ${tableName}`);
            
            await queryInterface.sequelize.query(
              `ALTER TABLE "${tableName}" 
               ALTER COLUMN "id" SET DEFAULT gen_random_uuid();`,
              { transaction }
            );
          } else {
            console.log(`La tabella ${tableName} ha già un valore di default per l'UUID`);
          }
        } else {
          console.log(`La tabella ${tableName} non ha una colonna id di tipo UUID`);
        }
      }

      await transaction.commit();
      console.log('Migration completata con successo');
    } catch (error) {
      await transaction.rollback();
      console.error('Errore durante la migration:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Recuperiamo l'elenco di tutte le tabelle nel database, escludendo SequelizeMeta
      const [tables] = await queryInterface.sequelize.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'
           AND table_name != 'SequelizeMeta';`,
        { transaction }
      );

      // Per ogni tabella
      for (const tableRow of tables) {
        const tableName = tableRow.table_name;
        
        // Otteniamo le informazioni sulla colonna ID
        const [columns] = await queryInterface.sequelize.query(
          `SELECT column_name, data_type, column_default
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = '${tableName}'
             AND column_name = 'id'
             AND data_type = 'uuid'
             AND column_default LIKE '%gen_random_uuid%';`,
          { transaction }
        );

        // Se esiste una colonna ID di tipo UUID con default gen_random_uuid
        if (columns.length > 0) {
          console.log(`Rimuovendo valore di default UUID dalla colonna id della tabella ${tableName}`);
          
          await queryInterface.sequelize.query(
            `ALTER TABLE "${tableName}" 
             ALTER COLUMN "id" DROP DEFAULT;`,
            { transaction }
          );
        }
      }

      await transaction.commit();
      console.log('Rollback completato con successo');
    } catch (error) {
      await transaction.rollback();
      console.error('Errore durante il rollback:', error);
      throw error;
    }
  }
};