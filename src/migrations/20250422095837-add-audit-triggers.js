'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Prima prova a vedere quali metodi di generazione UUID sono disponibili
    const [uuidFunctionResult] = await queryInterface.sequelize.query(`
      -- Prova prima a vedere se PostgreSQL ha la funzione nativa (13+)
      SELECT 'native' as type FROM pg_proc WHERE proname = 'gen_random_uuid' AND prokind = 'f'
      UNION
      -- Controlla se uuid-ossp è già installata
      SELECT 'uuid-ossp' as type FROM pg_extension WHERE extname = 'uuid-ossp'
      UNION
      -- Controlla se pgcrypto è disponibile
      SELECT 'pgcrypto' as type FROM pg_extension WHERE extname = 'pgcrypto'
      LIMIT 1;
    `);

    let uuidFunction;
    
    if (uuidFunctionResult.length === 0) {
      // Nessun generatore UUID trovato, proviamo a installare le estensioni
      try {
        // Prova prima uuid-ossp
        await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
        uuidFunction = 'gen_random_uuid()';
      } catch (error) {
        try {
          // Se fallisce, prova pgcrypto
          await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
          uuidFunction = 'gen_random_uuid()';
        } catch (pgcryptoError) {
          // Se anche pgcrypto fallisce, usa una soluzione lato applicazione
          console.warn('WARNING: Neither uuid-ossp nor pgcrypto extension available. UUID generation will be handled by the application.');
          uuidFunction = 'NULL'; // Il valore sarà gestito dall'applicazione
        }
      }
    } else {
      // Usa la funzione trovata
      switch (uuidFunctionResult[0].type) {
        case 'native':
          uuidFunction = 'gen_random_uuid()';
          break;
        case 'uuid-ossp':
          uuidFunction = 'gen_random_uuid()';
          break;
        case 'pgcrypto':
          uuidFunction = 'gen_random_uuid()';
          break;
        default:
          uuidFunction = 'NULL'; // Fallback
      }
    }

    // Funzione per il tracciamento generico delle modifiche
    await queryInterface.sequelize.query(`
      -- Funzione per tracciare le modifiche nelle tabelle
      CREATE OR REPLACE FUNCTION track_entity_changes()
      RETURNS TRIGGER AS $$
      DECLARE
        history_table_name TEXT;
        entity_id_column TEXT;
        current_user_id UUID;
        old_values JSONB;
        new_values JSONB;
        changed_fields TEXT[];
        differing_keys TEXT[];
        new_id UUID;
      BEGIN
        -- Genera nuovo ID per l'entry history
        ${uuidFunction === 'NULL' 
          ? '-- UUID sarà gestito dall\'applicazione' 
          : `new_id := ${uuidFunction};`}
        
        -- Inizializza il nome della tabella di history
        IF TG_TABLE_NAME = 'assets' THEN
          history_table_name := 'assets_history';
          entity_id_column := 'asset_id';
        ELSIF TG_TABLE_NAME = 'filiali' THEN
          history_table_name := 'filiali_history';
          entity_id_column := 'filiale_id';
        ELSIF TG_TABLE_NAME = 'edifici' THEN
          history_table_name := 'edifici_history';
          entity_id_column := 'edificio_id';
        ELSIF TG_TABLE_NAME = 'piani' THEN
          history_table_name := 'piani_history';
          entity_id_column := 'piano_id';
        ELSIF TG_TABLE_NAME = 'locali' THEN
          history_table_name := 'locali_history';
          entity_id_column := 'locale_id';
        ELSE
          -- Se non è una tabella tracciata, esci
          RETURN NEW;
        END IF;
        
        -- Prova a ottenere l'id utente dal contesto della sessione
        BEGIN
          current_user_id := current_setting('app.current_user_id', true)::uuid;
        EXCEPTION
          WHEN OTHERS THEN
            current_user_id := NULL;
        END;
        
        -- Se si tratta di un'operazione UPDATE
        IF (TG_OP = 'UPDATE') THEN
          -- Converti OLD e NEW in JSONB ed elimina i campi che non vogliamo tracciare
          old_values := to_jsonb(OLD);
          new_values := to_jsonb(NEW);
          
          -- Rimuovi i campi che non vogliamo tracciare nelle differenze
          old_values := old_values - 'created_at' - 'updated_at' - 'deleted_at' - 'created_by' - 'updated_by';
          new_values := new_values - 'created_at' - 'updated_at' - 'deleted_at' - 'created_by' - 'updated_by';
          
          -- Trova le chiavi che differiscono
          SELECT array_agg(k) INTO differing_keys
          FROM (
            SELECT jsonb_object_keys(old_values) AS k
            EXCEPT
            SELECT jsonb_object_keys(new_values) AS k
            UNION
            SELECT jsonb_object_keys(new_values) AS k
            EXCEPT
            SELECT jsonb_object_keys(old_values) AS k
            UNION
            SELECT jsonb_object_keys(old_values) AS k
            WHERE old_values->k IS DISTINCT FROM new_values->k
          ) sub;
          
          -- Se ci sono modifiche, inserisci nella tabella history
          IF differing_keys IS NOT NULL AND array_length(differing_keys, 1) > 0 THEN
            -- Filtra per tenere solo i campi modificati
            old_values := jsonb_object_agg(k, old_values->k) FROM unnest(differing_keys) AS k;
            new_values := jsonb_object_agg(k, new_values->k) FROM unnest(differing_keys) AS k;
            
            -- Inserisci nella tabella di history
            EXECUTE format(
              'INSERT INTO %I (id, %I, tenant_id, user_id, action, old_values, new_values, created_at, updated_at) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
              history_table_name,
              entity_id_column
            ) USING 
              COALESCE(new_id, gen_random_uuid()),  -- id (con fallback)
              NEW.id,              -- entity_id
              NEW.tenant_id,       -- tenant_id
              current_user_id,     -- user_id
              'update',            -- action
              old_values,          -- old_values
              new_values;          -- new_values
              
            -- Aggiorna il campo updated_by se non specificato esplicitamente
            IF NEW.updated_by IS NULL THEN
              NEW.updated_by := current_user_id;
            END IF;
            
            NEW.updated_at := NOW();
          END IF;
        
        -- Se si tratta di un'operazione DELETE
        ELSIF (TG_OP = 'DELETE') THEN
          -- Inserisci nella tabella di history
          EXECUTE format(
            'INSERT INTO %I (id, %I, tenant_id, user_id, action, old_values, new_values, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
            history_table_name,
            entity_id_column
          ) USING 
            COALESCE(new_id, gen_random_uuid()),  -- id (con fallback)
            OLD.id,                -- entity_id
            OLD.tenant_id,         -- tenant_id
            current_user_id,       -- user_id
            'delete',              -- action
            to_jsonb(OLD),         -- old_values
            NULL;                  -- new_values (NULL perché il record è stato eliminato)
        
        -- Se si tratta di un'operazione INSERT
        ELSIF (TG_OP = 'INSERT') THEN
          -- Inserisci nella tabella di history
          EXECUTE format(
            'INSERT INTO %I (id, %I, tenant_id, user_id, action, old_values, new_values, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
            history_table_name,
            entity_id_column
          ) USING 
            COALESCE(new_id, gen_random_uuid()),  -- id (con fallback)
            NEW.id,                -- entity_id
            NEW.tenant_id,         -- tenant_id
            current_user_id,       -- user_id
            'create',              -- action
            NULL,                  -- old_values (NULL perché è una creazione)
            to_jsonb(NEW);         -- new_values
            
          -- Imposta created_by se non è specificato
          IF NEW.created_by IS NULL THEN
            NEW.created_by := current_user_id;
          END IF;
          
          -- Imposta updated_by se non è specificato
          IF NEW.updated_by IS NULL THEN
            NEW.updated_by := current_user_id;
          END IF;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Crea i trigger per ogni tabella principale che richiede tracciamento
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

    for (const table of tables) {
      // Trigger BEFORE INSERT/UPDATE
      await queryInterface.sequelize.query(`
        DROP TRIGGER IF EXISTS ${table}_before_changes_trigger ON ${table};
        CREATE TRIGGER ${table}_before_changes_trigger
        BEFORE INSERT OR UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION track_entity_changes();
      `);

      // Trigger AFTER DELETE (deve essere AFTER perché in BEFORE il record non è ancora realmente eliminato)
      await queryInterface.sequelize.query(`
        DROP TRIGGER IF EXISTS ${table}_after_delete_trigger ON ${table};
        CREATE TRIGGER ${table}_after_delete_trigger
        AFTER DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION track_entity_changes();
      `);
    }
  },

  async down(queryInterface, Sequelize) {
    // Rimuovi i trigger da ogni tabella
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

    for (const table of tables) {
      await queryInterface.sequelize.query(`
        DROP TRIGGER IF EXISTS ${table}_before_changes_trigger ON ${table};
        DROP TRIGGER IF EXISTS ${table}_after_delete_trigger ON ${table};
      `);
    }

    // Rimuovi la funzione di tracking
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS track_entity_changes();
    `);
  }
};