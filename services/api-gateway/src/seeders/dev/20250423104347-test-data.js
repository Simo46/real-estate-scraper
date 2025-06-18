'use strict';
const bcrypt = require('bcryptjs');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // =====================================================================
      // 1. FUNZIONI UTILITY
      // =====================================================================
      
      /**
       * Funzione per inserire o aggiornare un record
       * @param {string} table - Nome della tabella
       * @param {Object} data - Dati da inserire/aggiornare
       * @param {Array} uniqueFields - Campi utilizzati per verificare l'esistenza
       * @param {Object} transaction - Transazione opzionale
       * @returns {string} - ID del record
       */
      const upsert = async (table, data, uniqueFields, transaction = null) => {
        const whereClause = uniqueFields.map(field => `${field} = ?`).join(' AND ');
        const replacements = uniqueFields.map(field => data[field]);
        
        // Verifica se il record esiste
        const [existing] = await queryInterface.sequelize.query(
          `SELECT id FROM ${table} WHERE ${whereClause}`,
          { 
            replacements,
            transaction
          }
        );
        
        if (existing.length > 0) {
          // Il record esiste - aggiorna
          const id = existing[0].id;
          const updateFields = Object.keys(data)
            .filter(key => !uniqueFields.includes(key) && key !== 'id')
            .map(key => `${key} = ?`).join(', ');
          
          if (updateFields) {
            const updateReplacements = Object.keys(data)
              .filter(key => !uniqueFields.includes(key) && key !== 'id')
              .map(key => data[key]);
            
            await queryInterface.sequelize.query(
              `UPDATE ${table} SET ${updateFields} WHERE id = ?`,
              { 
                replacements: [...updateReplacements, id],
                transaction
              }
            );
          }
          
          return id;
        } else {
          // Il record non esiste - inserisci
          // MODIFICA: Assicurati che ci sia sempre un valore per id
          const dataWithId = { ...data };
          if (!dataWithId.id) {
            // Genera un UUID direttamente nel SQL
            dataWithId.id = Sequelize.literal("gen_random_uuid()");
          }
          
          const fields = Object.keys(dataWithId);
          const placeholders = fields.map(field => 
            dataWithId[field] instanceof Sequelize.Utils.Literal ? dataWithId[field].val : '?'
          ).join(', ');
          
          // Prepara i valori, escludendo quelli che sono già literal SQL
          const values = fields
            .filter(field => !(dataWithId[field] instanceof Sequelize.Utils.Literal))
            .map(field => dataWithId[field]);
          
          // Costruisci la query con i campi generati direttamente come espressioni SQL
          let query = `INSERT INTO ${table} (${fields.join(', ')})\n`;
          query += `VALUES (${placeholders})\n`;
          query += `RETURNING id`;
          
          const [result] = await queryInterface.sequelize.query(
            query,
            { 
              replacements: values,
              transaction
            }
          );
          
          return result[0].id;
        }
      };
      
      /**
       * Funzione per hashare le password
       * @param {string} password - Password in chiaro
       * @returns {string} - Hash della password
       */
      const hashPassword = async (password) => {
        return await bcrypt.hash(password, 10);
      };
      
      // =====================================================================
      // 2. SETUP TENANT
      // =====================================================================
      
      console.log('Creazione tenant di test...');
      
      // Tenant principale per i test
      const tenantPrincipaleId = await upsert(
        'tenants',
        {
          name: 'Tenant Test',
          domain: 'test',
          code: 'TEST',
          active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        ['domain']
      );
      
      // Tenant secondario (per testare isolamento multi-tenant)
      const tenantSecondarioId = await upsert(
        'tenants',
        {
          name: 'Tenant Secondario',
          domain: 'test2',
          code: 'TEST2',
          active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        ['domain']
      );
      
      console.log(`Tenant creati: principale (${tenantPrincipaleId}), secondario (${tenantSecondarioId})`);
      
      // =====================================================================
      // 3. SETUP RUOLI (se non già creati dal policyBuilder)
      // =====================================================================
      
      console.log('Verifica/creazione ruoli di sistema...');
      
      // Verifica se i ruoli sono già stati creati dal policyBuilder
      const roleNames = [
        'Amministratore di Sistema', 
        'Ufficio Tecnico', 
        'Ufficio Post Vendita', 
        'Area Manager', 
        'Responsabile Filiale', 
        'Responsabile Officina e Service', 
        'Magazzino'
      ];
      
      const roleIds = {};
      
      for (const roleName of roleNames) {
        // Cerca o crea il ruolo
        const [existingRole] = await queryInterface.sequelize.query(
          `SELECT id FROM roles WHERE name = ?`,
          { replacements: [roleName] }
        );
        
        if (existingRole.length > 0) {
          roleIds[roleName] = existingRole[0].id;
          console.log(`Ruolo '${roleName}' già esistente con ID: ${roleIds[roleName]}`);
        } else {
          // Crea il ruolo solo se non esiste
          const roleId = await upsert(
            'roles',
            {
              name: roleName,
              description: `Ruolo ${roleName}`,
              created_at: new Date(),
              updated_at: new Date()
            },
            ['name']
          );
          
          roleIds[roleName] = roleId;
          console.log(`Ruolo '${roleName}' creato con ID: ${roleIds[roleName]}`);
        }
      }
      
      // =====================================================================
      // 3.1 SETUP ABILITIES - Nuova sezione per configurare le abilities dei ruoli
      // =====================================================================
      
      console.log('Configurazione abilities per i ruoli...');
      
      // Elimina prima tutte le abilities esistenti per ricominciare da zero
      await queryInterface.sequelize.query(`DELETE FROM abilities`);
      
      // Definizione delle abilities per ciascun ruolo
      const roleAbilities = {
        'Amministratore di Sistema': [
          // Admin ha potere di fare tutto
          { action: 'manage', subject: 'all', inverted: false, reason: 'Admin può fare tutto' }
        ],
        'Ufficio Tecnico': [
          // Gestione complete asset e location
          { action: 'manage', subject: 'Asset', inverted: false },
          { action: 'manage', subject: 'Attrezzatura', inverted: false },
          { action: 'manage', subject: 'StrumentoDiMisura', inverted: false },
          { action: 'manage', subject: 'ImpiantoTecnologico', inverted: false },
          { action: 'manage', subject: 'Filiale', inverted: false },
          { action: 'manage', subject: 'Edificio', inverted: false },
          { action: 'manage', subject: 'Piano', inverted: false },
          { action: 'manage', subject: 'locale', inverted: false },
          { action: 'manage', subject: 'Fornitore', inverted: false },
          
          // Gestione utenti completa - può creare, leggere, aggiornare, eliminare utenti
          { action: 'manage', subject: 'User', inverted: false, reason: 'Ufficio Tecnico può gestire tutti gli utenti' },
          
          // Lettura ruoli
          { action: 'read', subject: 'Role', inverted: false }
        ],
        'Ufficio Post Vendita': [
          // Lettura completa
          { action: 'read', subject: 'Asset', inverted: false },
          { action: 'read', subject: 'Attrezzatura', inverted: false },
          { action: 'read', subject: 'StrumentoDiMisura', inverted: false },
          { action: 'read', subject: 'ImpiantoTecnologico', inverted: false },
          { action: 'read', subject: 'Filiale', inverted: false },
          { action: 'read', subject: 'Edificio', inverted: false },
          { action: 'read', subject: 'Piano', inverted: false },
          { action: 'read', subject: 'locale', inverted: false },
          { action: 'read', subject: 'Fornitore', inverted: false },
          
          // Modifica asset
          { action: 'update', subject: 'Asset', inverted: false },
          { action: 'update', subject: 'Attrezzatura', inverted: false },
          { action: 'update', subject: 'StrumentoDiMisura', inverted: false },
          { action: 'update', subject: 'ImpiantoTecnologico', inverted: false },
          
          // Gestione utenti completa - può creare, leggere, aggiornare, eliminare utenti
          { action: 'manage', subject: 'User', inverted: false, reason: 'Ufficio Post Vendita può gestire tutti gli utenti' },
          
          // Lettura ruoli
          { action: 'read', subject: 'Role', inverted: false }
        ],
        'Area Manager': [
          // Lettura filiali (filtrata per area in Conditions)
          { action: 'read', subject: 'Filiale', inverted: false },
          { action: 'read', subject: 'Edificio', inverted: false },
          { action: 'read', subject: 'Piano', inverted: false },
          { action: 'read', subject: 'locale', inverted: false },
          
          // Lettura e modifica asset (filtrati per area)
          { action: 'read', subject: 'Asset', inverted: false },
          { action: 'read', subject: 'Attrezzatura', inverted: false },
          { action: 'read', subject: 'StrumentoDiMisura', inverted: false },
          { action: 'read', subject: 'ImpiantoTecnologico', inverted: false },
          { action: 'update', subject: 'Asset', inverted: false },
          { action: 'update', subject: 'Attrezzatura', inverted: false },
          { action: 'update', subject: 'StrumentoDiMisura', inverted: false },
          { action: 'update', subject: 'ImpiantoTecnologico', inverted: false },
          
          // Lettura fornitori
          { action: 'read', subject: 'Fornitore', inverted: false },
          
          // Lettura utenti (filtrati per area) - RIMUOVERE ABILITÀ DI GESTIONE UTENTI
          { action: 'read', subject: 'User', inverted: false },
          
          // Lettura ruoli
          { action: 'read', subject: 'Role', inverted: false }
        ],
        'Responsabile Filiale': [
          // Lettura propria filiale
          { action: 'read', subject: 'Filiale', inverted: false },
          { action: 'read', subject: 'Edificio', inverted: false },
          { action: 'read', subject: 'Piano', inverted: false },
          { action: 'read', subject: 'locale', inverted: false },
          
          // Gestione asset della propria filiale
          { action: 'manage', subject: 'Asset', inverted: false },
          { action: 'manage', subject: 'Attrezzatura', inverted: false },
          { action: 'manage', subject: 'StrumentoDiMisura', inverted: false },
          { action: 'manage', subject: 'ImpiantoTecnologico', inverted: false },
          
          // Lettura asset di altre filiali
          { action: 'read', subject: 'Asset', inverted: false },
          { action: 'read', subject: 'Attrezzatura', inverted: false },
          { action: 'read', subject: 'StrumentoDiMisura', inverted: false },
          { action: 'read', subject: 'ImpiantoTecnologico', inverted: false },
          
          // Gestione fornitori
          { action: 'read', subject: 'Fornitore', inverted: false },
          { action: 'create', subject: 'Fornitore', inverted: false },
          { action: 'update', subject: 'Fornitore', inverted: false },
          
          // RIMUOVERE ABILITÀ DI GESTIONE UTENTI - solo lettura degli utenti della propria filiale
          { action: 'read', subject: 'User', inverted: false }
        ],
        'Responsabile Officina e Service': [
          // Lettura propria filiale
          { action: 'read', subject: 'Filiale', inverted: false },
          { action: 'read', subject: 'Edificio', inverted: false },
          { action: 'read', subject: 'Piano', inverted: false },
          { action: 'read', subject: 'locale', inverted: false },
          
          // Gestione asset della propria filiale
          { action: 'read', subject: 'Asset', inverted: false },
          { action: 'update', subject: 'Asset', inverted: false },
          { action: 'read', subject: 'Attrezzatura', inverted: false },
          { action: 'update', subject: 'Attrezzatura', inverted: false },
          { action: 'read', subject: 'StrumentoDiMisura', inverted: false },
          { action: 'update', subject: 'StrumentoDiMisura', inverted: false },
          { action: 'read', subject: 'ImpiantoTecnologico', inverted: false },
          { action: 'update', subject: 'ImpiantoTecnologico', inverted: false },
          
          // Lettura asset di altre filiali
          { action: 'read', subject: 'Asset', inverted: false },
          { action: 'read', subject: 'Attrezzatura', inverted: false },
          { action: 'read', subject: 'StrumentoDiMisura', inverted: false },
          { action: 'read', subject: 'ImpiantoTecnologico', inverted: false },
          
          // Gestione fornitori
          { action: 'read', subject: 'Fornitore', inverted: false },
          { action: 'create', subject: 'Fornitore', inverted: false },
          { action: 'update', subject: 'Fornitore', inverted: false }
        ],
        'Magazzino': [
          // Accesso limitato all'inventario della propria filiale
          { action: 'read', subject: 'Asset', inverted: false },
          { action: 'update', subject: 'Asset', inverted: false },
          { action: 'read', subject: 'Attrezzatura', inverted: false },
          { action: 'read', subject: 'StrumentoDiMisura', inverted: false },
          { action: 'read', subject: 'ImpiantoTecnologico', inverted: false }
        ]
      };
      
      // Crea abilities per ogni ruolo
      for (const [roleName, abilities] of Object.entries(roleAbilities)) {
        const roleId = roleIds[roleName];
        
        if (!roleId) {
          console.warn(`Ruolo '${roleName}' non trovato, impossibile creare abilities`);
          continue;
        }
        
        for (const ability of abilities) {
          await upsert(
            'abilities',
            {
              role_id: roleId,
              action: ability.action,
              subject: ability.subject,
              conditions: ability.conditions || null,
              fields: ability.fields || null,
              inverted: ability.inverted || false,
              reason: ability.reason || null,
              created_at: new Date(),
              updated_at: new Date()
            },
            ['role_id', 'action', 'subject']
          );
        }
        
        console.log(`Abilities configurate per il ruolo '${roleName}'`);
      }
      
      // =====================================================================
      // 4. SETUP FILIALI
      // =====================================================================
      
      console.log('Creazione filiali di test...');
      
      // Definiamo 4 filiali: Roma, Milano, Napoli, Bari
      const filiali = [
        {
          nome: 'Roma',
          code: 'RM',
          comune: 'Roma',
          provincia: 'RM',
          regione: 'Lazio'
        },
        {
          nome: 'Milano',
          code: 'MI',
          comune: 'Milano',
          provincia: 'MI',
          regione: 'Lombardia'
        },
        {
          nome: 'Napoli',
          code: 'NA',
          comune: 'Napoli',
          provincia: 'NA',
          regione: 'Campania'
        },
        {
          nome: 'Bari',
          code: 'BA',
          comune: 'Bari',
          provincia: 'BA',
          regione: 'Puglia'
        }
      ];
      
      const filialiIds = {};
      
      for (const filiale of filiali) {
        const filialeId = await upsert(
          'filiali',
          {
            tenant_id: tenantPrincipaleId,
            code: filiale.code,
            description: `Filiale di ${filiale.nome}`,
            comune: filiale.comune,
            provincia: filiale.provincia,
            regione: filiale.regione,
            cap: '00000',
            active: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          ['tenant_id', 'code']
        );
        
        filialiIds[filiale.nome] = filialeId;
        console.log(`Filiale '${filiale.nome}' creata/aggiornata con ID: ${filialeId}`);
      }
      
      // =====================================================================
      // 5. SETUP UTENTI PER OGNI RUOLO
      // =====================================================================
      
      console.log('Creazione utenti di test...');
      
      // Verifica se l'utente di sistema esiste e preservalo
      const [systemUser] = await queryInterface.sequelize.query(
        `SELECT id FROM users WHERE id = '00000000-0000-0000-0000-000000000000'`
      );
      
      if (systemUser.length > 0) {
        console.log(`Utente di sistema trovato con ID: ${systemUser[0].id}`);
      }
      
      // Password standard per tutti gli utenti di test
      const passwordHash = await hashPassword('password');
      
      // Definizione utenti di test
      const users = [
        // Amministratore di Sistema (indipendente dalle filiali)
        {
          name: 'Admin',
          email: 'admin@example.com',
          username: 'admin',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: null,
          role: 'Amministratore di Sistema'
        },
        
        // Ufficio Tecnico (accesso a tutte le filiali)
        {
          name: 'Tecnico',
          email: 'tecnico@example.com',
          username: 'tecnico',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: null, // Nessuna filiale specifica
          role: 'Ufficio Tecnico'
        },
        
        // Ufficio Post Vendita (accesso a tutte le filiali)
        {
          name: 'Post Vendita',
          email: 'postvendita@example.com',
          username: 'postvendita',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: null, // Nessuna filiale specifica
          role: 'Ufficio Post Vendita'
        },
        
        // Area Manager 1 (Roma e Milano)
        {
          name: 'Area Manager Centro-Nord',
          email: 'manager1@example.com',
          username: 'manager1',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: null, // Nessuna filiale specifica, ma avrà accesso a Roma e Milano
          role: 'Area Manager'
        },
        
        // Area Manager 2 (Napoli e Bari)
        {
          name: 'Area Manager Sud',
          email: 'manager2@example.com',
          username: 'manager2',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: null, // Nessuna filiale specifica, ma avrà accesso a Napoli e Bari
          role: 'Area Manager'
        },
        
        // Responsabili Filiale
        {
          name: 'Responsabile Roma',
          email: 'resp.roma@example.com',
          username: 'resp.roma',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: filialiIds['Roma'],
          role: 'Responsabile Filiale'
        },
        {
          name: 'Responsabile Milano',
          email: 'resp.milano@example.com',
          username: 'resp.milano',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: filialiIds['Milano'],
          role: 'Responsabile Filiale'
        },
        {
          name: 'Responsabile Napoli',
          email: 'resp.napoli@example.com',
          username: 'resp.napoli',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: filialiIds['Napoli'],
          role: 'Responsabile Filiale'
        },
        {
          name: 'Responsabile Bari',
          email: 'resp.bari@example.com',
          username: 'resp.bari',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: filialiIds['Bari'],
          role: 'Responsabile Filiale'
        },
        
        // Responsabili Officina
        {
          name: 'Officina Roma',
          email: 'officina.roma@example.com',
          username: 'officina.roma',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: filialiIds['Roma'],
          role: 'Responsabile Officina e Service'
        },
        {
          name: 'Officina Milano',
          email: 'officina.milano@example.com',
          username: 'officina.milano',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: filialiIds['Milano'],
          role: 'Responsabile Officina e Service'
        },
        
        // Magazzino
        {
          name: 'Magazzino Roma',
          email: 'magazzino.roma@example.com',
          username: 'magazzino.roma',
          password: passwordHash,
          tenant_id: tenantPrincipaleId,
          filiale_id: filialiIds['Roma'],
          role: 'Magazzino'
        }
      ];
      
      // Creazione degli utenti e associazione ruoli
      const userIds = {};
      
      for (const userData of users) {
        const { role, ...userInfo } = userData;
        
        const userId = await upsert(
          'users',
          {
            ...userInfo,
            active: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          ['email', 'username']
        );
        
        userIds[userData.username] = userId;
        console.log(`Utente '${userData.username}' creato/aggiornato con ID: ${userId}`);
        
        // Associa il ruolo all'utente se esiste
        if (role && roleIds[role]) {
          await upsert(
            'user_roles',
            {
              id: Sequelize.literal('gen_random_uuid()'),
              user_id: userId,
              role_id: roleIds[role],
              created_at: new Date(),
              updated_at: new Date()
            },
            ['user_id', 'role_id']
          );
          
          console.log(`Ruolo '${role}' associato all'utente '${userData.username}'`);
        }
      }
      
      // =====================================================================
      // 6. SETUP LOOKUP TABLES (Stati dotazione e tipi di valori)
      // =====================================================================
      
      console.log('Configurazione tabelle di lookup...');
      
      // Setup stati dotazione se non esistono
      const statiDotazione = [
        { code: 'IN_USO', description: 'In uso', color: '#4CAF50' },
        { code: 'IN_MANUTENZIONE', description: 'In manutenzione', color: '#FF9800' },
        { code: 'DISMESSO', description: 'Dismesso', color: '#F44336' }
      ];
      
      const statiMap = {};
      
      for (const stato of statiDotazione) {
        const statoId = await upsert(
          'stati_dotazione',
          {
            ...stato,
            active: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          ['code']
        );
        
        statiMap[stato.code] = statoId;
        console.log(`Stato dotazione '${stato.code}' creato/aggiornato con ID: ${statoId}`);
      }
      
      // Setup tipi alimentazione se necessario per impianti tecnologici
      const tipiAlimentazione = [
        { code: 'ELETTRICA', description: 'Elettrica' },
        { code: 'GAS', description: 'Gas' },
        { code: 'IBRIDA', description: 'Ibrida' }
      ];
      
      const tipiAlimentazioneMap = {};
      
      for (const tipo of tipiAlimentazione) {
        const tipoId = await upsert(
          'tipi_alimentazione',
          {
            ...tipo,
            active: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          ['code']
        );
        
        tipiAlimentazioneMap[tipo.code] = tipoId;
        console.log(`Tipo alimentazione '${tipo.code}' creato/aggiornato con ID: ${tipoId}`);
      }
      
      // Setup categorie per le attrezzature
      const categorieAttrezzature = [
        { code: 'PONTE', description: 'Ponte sollevatore', tenant_id: tenantPrincipaleId },
        { code: 'COMPRESSORE', description: 'Compressore', tenant_id: tenantPrincipaleId },
        { code: 'UTENSILI', description: 'Utensili manuali', tenant_id: tenantPrincipaleId }
      ];
      
      const categorieAttrezzatureMap = {};
      
      for (const categoria of categorieAttrezzature) {
        const categoriaId = await upsert(
          'categorie_attrezzature',
          {
            ...categoria,
            active: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          ['code', 'tenant_id']
        );
        
        categorieAttrezzatureMap[categoria.code] = categoriaId;
        console.log(`Categoria attrezzatura '${categoria.code}' creata/aggiornata con ID: ${categoriaId}`);
      }
      
      // Setup categorie per gli strumenti di misura
      const categorieStrumenti = [
        { code: 'DIAGNOSTICA', description: 'Strumenti diagnostici', tenant_id: tenantPrincipaleId },
        { code: 'MISURA', description: 'Strumenti di misura', tenant_id: tenantPrincipaleId }
      ];
      
      const categorieStrumentiMap = {};
      
      for (const categoria of categorieStrumenti) {
        const categoriaId = await upsert(
          'categorie_strumenti_misura',
          {
            ...categoria,
            active: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          ['code', 'tenant_id']
        );
        
        categorieStrumentiMap[categoria.code] = categoriaId;
        console.log(`Categoria strumenti '${categoria.code}' creata/aggiornata con ID: ${categoriaId}`);
      }
      
      // Setup categorie per gli impianti tecnologici
      const categorieImpianti = [
        { code: 'CLIMATIZZAZIONE', description: 'Impianti di climatizzazione', tenant_id: tenantPrincipaleId },
        { code: 'ELETTRICO', description: 'Impianti elettrici', tenant_id: tenantPrincipaleId }
      ];
      
      const categorieImpiantiMap = {};
      
      for (const categoria of categorieImpianti) {
        const categoriaId = await upsert(
          'categorie_impianti_tecnologici',
          {
            ...categoria,
            active: true,
            created_at: new Date(),
            updated_at: new Date()
          },
          ['code', 'tenant_id']
        );
        
        categorieImpiantiMap[categoria.code] = categoriaId;
        console.log(`Categoria impianti '${categoria.code}' creata/aggiornata con ID: ${categoriaId}`);
      }
      
      // =====================================================================
      // 7. SETUP ASSET DI ESEMPIO
      // =====================================================================
      
      console.log('Creazione asset di esempio...');
      
      // Definizione di alcuni asset di esempio
      const assets = [
        // Attrezzature per Roma
        {
          filiale: 'Roma',
          code: 'ATT-RM-001',
          description: 'Compressore 200L',
          asset_type: 'attrezzatura',
          marca: 'Fiac',
          modello: 'AB200',
          stato_dotazione: 'IN_USO',
          categoria: 'COMPRESSORE'
        },
        {
          filiale: 'Roma',
          code: 'ATT-RM-002',
          description: 'Kit chiavi dinamometriche',
          asset_type: 'attrezzatura',
          marca: 'Beta',
          modello: 'Professional',
          stato_dotazione: 'IN_USO',
          categoria: 'UTENSILI'
        },
        
        // Attrezzature per Milano
        {
          filiale: 'Milano',
          code: 'ATT-MI-001',
          description: 'Compressore 300L',
          asset_type: 'attrezzatura',
          marca: 'Fiac',
          modello: 'AB300',
          stato_dotazione: 'IN_USO',
          categoria: 'COMPRESSORE'
        },
        {
          filiale: 'Milano',
          code: 'ATT-MI-002',
          description: 'Ponte sollevatore',
          asset_type: 'attrezzatura',
          marca: 'Ravaglioli',
          modello: 'KP302',
          stato_dotazione: 'IN_MANUTENZIONE',
          categoria: 'PONTE'
        },
        
        // Strumenti di misura per Napoli
        {
          filiale: 'Napoli',
          code: 'SDM-NA-001',
          description: 'Oscilloscopio',
          asset_type: 'strumento_misura',
          marca: 'Tektronix',
          modello: 'TBS1072B',
          stato_dotazione: 'IN_USO',
          categoria: 'DIAGNOSTICA'
        },
        
        // Impianti tecnologici per Bari
        {
          filiale: 'Bari',
          code: 'IMP-BA-001',
          description: 'Impianto di climatizzazione',
          asset_type: 'impianto',
          marca: 'Daikin',
          modello: 'FTXS35K',
          stato_dotazione: 'DISMESSO',
          categoria: 'CLIMATIZZAZIONE',
          tipo_alimentazione: 'ELETTRICA'
        }
      ];
      
      // Creazione degli asset
      for (const assetData of assets) {
        const filiale = assetData.filiale;
        const stato = assetData.stato_dotazione;
        const categoria = assetData.categoria;
        const tipoAlimentazione = assetData.tipo_alimentazione;
        
        // Rimuovi i campi che non appartengono alla tabella assets
        delete assetData.filiale;
        delete assetData.stato_dotazione;
        delete assetData.categoria;
        delete assetData.tipo_alimentazione;
        
        // Crea l'asset base
        const assetId = await upsert(
          'assets',
          {
            ...assetData,
            tenant_id: tenantPrincipaleId,
            filiale_id: filialiIds[filiale],
            stato_dotazione_id: statiMap[stato] || null,
            created_at: new Date(),
            updated_at: new Date()
          },
          ['tenant_id', 'code']
        );
        
        console.log(`Asset '${assetData.code}' creato/aggiornato con ID: ${assetId}`);
        
        // Se l'asset è un'attrezzatura, creiamo il record corrispondente
        if (assetData.asset_type === 'attrezzatura') {
          await upsert(
            'attrezzature',
            {
              asset_id: assetId,
              tenant_id: tenantPrincipaleId,
              categoria_id: categorieAttrezzatureMap[categoria] || null,
              created_at: new Date(),
              updated_at: new Date()
            },
            ['asset_id']
          );
          
          console.log(`Attrezzatura per asset '${assetData.code}' creata/aggiornata`);
        }
        
        // Se l'asset è uno strumento di misura, creiamo il record corrispondente
        if (assetData.asset_type === 'strumento_misura') {
          await upsert(
            'strumenti_di_misura',
            {
              asset_id: assetId,
              tenant_id: tenantPrincipaleId,
              categoria_id: categorieStrumentiMap[categoria] || null,
              created_at: new Date(),
              updated_at: new Date()
            },
            ['asset_id']
          );
          
          console.log(`Strumento di misura per asset '${assetData.code}' creato/aggiornato`);
        }
        
        // Se l'asset è un impianto tecnologico, creiamo il record corrispondente
        if (assetData.asset_type === 'impianto') {
          await upsert(
            'impianti_tecnologici',
            {
              asset_id: assetId,
              tenant_id: tenantPrincipaleId,
              categoria_id: categorieImpiantiMap[categoria] || null,
              tipo_alimentazione_id: tipiAlimentazioneMap[tipoAlimentazione] || null,
              created_at: new Date(),
              updated_at: new Date()
            },
            ['asset_id']
          );
          
          console.log(`Impianto tecnologico per asset '${assetData.code}' creato/aggiornato`);
        }
      }
      
      // =====================================================================
      // 8. SETUP AREA MANAGER (accessi a filiali specifiche)
      // =====================================================================
      
      console.log('Configurazione accessi Area Manager...');
      
      // Implementazione della logica per gli Area Manager
      // In questo caso, utilizziamo un approccio basato su condizioni CASL
      // L'Area Manager 1 può vedere Roma e Milano
      // L'Area Manager 2 può vedere Napoli e Bari
      
      // Nell'implementazione completa, dovresti creare una tabella specifica per questa relazione
      // Per ora, possiamo annotare questa relazione nei metadati degli utenti o nelle abilities
      
      // Aggiungiamo un campo settings JSON all'utente come metadati
      await queryInterface.sequelize.query(`
        UPDATE users 
        SET settings = '{"managed_filiali": ["${filialiIds['Roma']}", "${filialiIds['Milano']}"]}'::jsonb
        WHERE username = 'manager1'
      `);
      
      await queryInterface.sequelize.query(`
        UPDATE users 
        SET settings = '{"managed_filiali": ["${filialiIds['Napoli']}", "${filialiIds['Bari']}"]}'::jsonb
        WHERE username = 'manager2'
      `);
      
      console.log('Configurazione accessi Area Manager completata');
      
      console.log('Seeding completato con successo!');
      
    } catch (error) {
      console.error('Errore durante il seeding:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // Il down non è implementato per evitare cancellazioni accidentali
    // Se necessario, implementare una logica di rollback sicura
    console.log('Rollback non implementato per il seeder di test');
  }
};