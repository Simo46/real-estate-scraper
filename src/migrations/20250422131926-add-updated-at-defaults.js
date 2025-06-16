'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Ottieni tutte le tabelle nel database
    const [tables] = await queryInterface.sequelize.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );

    // Itera su tutte le tabelle
    for (const table of tables) {
      const tableName = table.tablename;
      
      // Verifica se la tabella ha una colonna updated_at
      const [columns] = await queryInterface.sequelize.query(
        `SELECT column_name 
         FROM information_schema.columns 
         WHERE table_schema = 'public' 
         AND table_name = '${tableName}' 
         AND column_name = 'updated_at'`
      );
      
      // Se la tabella ha una colonna updated_at, modifica il valore predefinito
      if (columns.length > 0) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${tableName}" 
           ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP`
        );
        
        // Opzionalmente, aggiungi anche un trigger per aggiornare automaticamente updated_at
        await queryInterface.sequelize.query(`
          CREATE OR REPLACE FUNCTION update_updated_at_column()
          RETURNS TRIGGER AS $$
          BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
          
          DROP TRIGGER IF EXISTS update_${tableName}_updated_at ON "${tableName}";
          
          CREATE TRIGGER update_${tableName}_updated_at
          BEFORE UPDATE ON "${tableName}"
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
        `);
        
        console.log(`Aggiornata tabella "${tableName}" con default CURRENT_TIMESTAMP per updated_at e trigger di aggiornamento automatico`);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    // Ottieni tutte le tabelle nel database
    const [tables] = await queryInterface.sequelize.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    );

    // Itera su tutte le tabelle
    for (const table of tables) {
      const tableName = table.tablename;
      
      // Verifica se la tabella ha una colonna updated_at
      const [columns] = await queryInterface.sequelize.query(
        `SELECT column_name 
         FROM information_schema.columns 
         WHERE table_schema = 'public' 
         AND table_name = '${tableName}' 
         AND column_name = 'updated_at'`
      );
      
      // Se la tabella ha una colonna updated_at, ripristina il valore predefinito
      if (columns.length > 0) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${tableName}" 
           ALTER COLUMN updated_at DROP DEFAULT`
        );
        
        // Rimuovi anche il trigger
        await queryInterface.sequelize.query(`
          DROP TRIGGER IF EXISTS update_${tableName}_updated_at ON "${tableName}";
        `);
        
        console.log(`Ripristinata tabella "${tableName}" rimuovendo default per updated_at e trigger`);
      }
    }
    
    // Rimuovi la funzione di trigger se non ci sono più trigger che la utilizzano
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS update_updated_at_column();
    `);
  }
};