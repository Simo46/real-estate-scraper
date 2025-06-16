'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION public.track_entity_changes()
       RETURNS trigger
       LANGUAGE plpgsql
      AS $function$
      DECLARE
        history_table_name TEXT;
        entity_id_column TEXT;
        current_user_id UUID;
        old_values JSONB;
        new_values JSONB;
        diff_old_values JSONB;
        diff_new_values JSONB;
        differing_keys TEXT[];
        new_id UUID;
        key_name TEXT;
      BEGIN
        -- Genera nuovo ID per l'entry history
        new_id := gen_random_uuid();
        
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
          
          -- Inizializza l'array che conterrà le chiavi modificate
          differing_keys := ARRAY[]::TEXT[];
          
          -- Trova le chiavi presenti in old_values ma non in new_values
          FOR key_name IN SELECT jsonb_object_keys(old_values)
          LOOP
            IF new_values->key_name IS NULL THEN
              differing_keys := differing_keys || key_name;
            END IF;
          END LOOP;
          
          -- Trova le chiavi presenti in new_values ma non in old_values
          FOR key_name IN SELECT jsonb_object_keys(new_values)
          LOOP
            IF old_values->key_name IS NULL THEN
              differing_keys := differing_keys || key_name;
            END IF;
          END LOOP;
          
          -- Trova le chiavi comuni ma con valori diversi
          FOR key_name IN SELECT jsonb_object_keys(old_values)
          LOOP
            IF new_values->key_name IS NOT NULL AND old_values->key_name IS DISTINCT FROM new_values->key_name THEN
              differing_keys := differing_keys || key_name;
            END IF;
          END LOOP;
          
          -- Se ci sono modifiche, inserisci nella tabella history
          IF differing_keys IS NOT NULL AND array_length(differing_keys, 1) > 0 THEN
            -- Inizializza JSON temporanei
            diff_old_values := '{}'::jsonb;
            diff_new_values := '{}'::jsonb;
            
            -- Costruisci manualmente gli oggetti JSON con solo le chiavi modificate
            FOR key_name IN SELECT * FROM unnest(differing_keys)
            LOOP
              IF old_values ? key_name THEN
                diff_old_values := diff_old_values || jsonb_build_object(key_name, old_values->key_name);
              END IF;
              
              IF new_values ? key_name THEN
                diff_new_values := diff_new_values || jsonb_build_object(key_name, new_values->key_name);
              END IF;
            END LOOP;
            
            -- Inserisci nella tabella di history con cast espliciti
            EXECUTE format(
              'INSERT INTO %I (id, %I, tenant_id, user_id, action, old_values, new_values, created_at, updated_at) 
               VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, $7::jsonb, NOW(), NOW())',
              history_table_name,
              entity_id_column
            ) USING 
              COALESCE(new_id, gen_random_uuid()),  -- id (con fallback)
              NEW.id,              -- entity_id
              NEW.tenant_id,       -- tenant_id
              current_user_id,     -- user_id
              'update',            -- action
              diff_old_values,     -- old_values (filtrato)
              diff_new_values;     -- new_values (filtrato)
              
            -- Aggiorna il campo updated_by se non specificato esplicitamente
            IF NEW.updated_by IS NULL THEN
              NEW.updated_by := current_user_id;
            END IF;
            
            NEW.updated_at := NOW();
          END IF;
        
        -- Se si tratta di un'operazione DELETE
        ELSIF (TG_OP = 'DELETE') THEN
          -- Converti OLD in JSONB
          old_values := to_jsonb(OLD);
          
          -- Inserisci nella tabella di history con cast espliciti
          EXECUTE format(
            'INSERT INTO %I (id, %I, tenant_id, user_id, action, old_values, new_values, created_at, updated_at) 
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, $7::jsonb, NOW(), NOW())',
            history_table_name,
            entity_id_column
          ) USING 
            COALESCE(new_id, gen_random_uuid()),  -- id (con fallback)
            OLD.id,                -- entity_id
            OLD.tenant_id,         -- tenant_id
            current_user_id,       -- user_id
            'delete',              -- action
            old_values,            -- old_values
            NULL::jsonb;           -- new_values (NULL perché il record è stato eliminato)
        
        -- Se si tratta di un'operazione INSERT
        ELSIF (TG_OP = 'INSERT') THEN
          -- Converti NEW in JSONB
          new_values := to_jsonb(NEW);
          
          -- Inserisci nella tabella di history con cast espliciti
          EXECUTE format(
            'INSERT INTO %I (id, %I, tenant_id, user_id, action, old_values, new_values, created_at, updated_at) 
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text, $6::jsonb, $7::jsonb, NOW(), NOW())',
            history_table_name,
            entity_id_column
          ) USING 
            COALESCE(new_id, gen_random_uuid()),  -- id (con fallback)
            NEW.id,                -- entity_id
            NEW.tenant_id,         -- tenant_id
            current_user_id,       -- user_id
            'create',              -- action
            NULL::jsonb,           -- old_values (NULL perché è una creazione)
            new_values;            -- new_values
            
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
      $function$;
    `);
  },

  async down(queryInterface, Sequelize) {
    // In caso di rollback, è meglio mantenere la versione corretta
    // ma se necessario, si può ripristinare la versione precedente
    await queryInterface.sequelize.query(`
      -- Se necessario, ripristina la versione precedente qui
    `);
  }
};