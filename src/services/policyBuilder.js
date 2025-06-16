'use strict';

const { createLogger } = require('../utils/logger');
const logger = createLogger('services:policy-builder');

/**
 * Servizio per costruire e caricare le policy dei ruoli dal database (serve per i seeder)
 */
class PolicyBuilder {
  constructor() {
    this.defaultRoles = [
      {
        name: 'Amministratore di Sistema',
        description: 'Accesso completo a tutte le funzionalità del sistema',
        abilities: [
          { action: 'manage', subject: 'all' }, // Permesso completo su tutto
          { action: 'manage', subject: 'UserAbility' } // Permesso di gestire permessi individuali
        ]
      },
      {
        name: 'Ufficio Tecnico',
        description: 'Supervisione e amministrazione tecnica completa',
        abilities: [
          // Gestione completa asset e location
          { action: 'manage', subject: 'Asset' },
          { action: 'manage', subject: 'Attrezzatura' },
          { action: 'manage', subject: 'StrumentoDiMisura' },
          { action: 'manage', subject: 'ImpiantoTecnologico' },
          { action: 'manage', subject: 'Filiale' },
          { action: 'manage', subject: 'Edificio' },
          { action: 'manage', subject: 'Piano' },
          { action: 'manage', subject: 'locale' },
          { action: 'manage', subject: 'Fornitore' },
          // Gestione utenti limitata
          { action: 'read', subject: 'User' },
          { action: 'create', subject: 'User' },
          { action: 'update', subject: 'User' },
          // Lettura ruoli
          { action: 'read', subject: 'Role' },
          // Permesso di leggere permessi individuali
          { action: 'read', subject: 'UserAbility' } 
        ]
      },
      {
        name: 'Ufficio Post Vendita',
        description: 'Gestione documentale e supervisione asset',
        abilities: [
          // Lettura completa
          { action: 'read', subject: 'Asset' },
          { action: 'read', subject: 'Attrezzatura' },
          { action: 'read', subject: 'StrumentoDiMisura' },
          { action: 'read', subject: 'ImpiantoTecnologico' },
          { action: 'read', subject: 'Filiale' },
          { action: 'read', subject: 'Edificio' },
          { action: 'read', subject: 'Piano' },
          { action: 'read', subject: 'locale' },
          { action: 'read', subject: 'Fornitore' },
          // Modifica asset
          { action: 'update', subject: 'Asset' },
          { action: 'update', subject: 'Attrezzatura' },
          { action: 'update', subject: 'StrumentoDiMisura' },
          { action: 'update', subject: 'ImpiantoTecnologico' },
          // Lettura utenti
          { action: 'read', subject: 'User' }
        ]
      },
      {
        name: 'Area Manager',
        description: 'Gestione delle filiali nella propria area geografica',
        abilities: [
          // Lettura filiali (filtrata per area in Conditions)
          { action: 'read', subject: 'Filiale' },
          { action: 'read', subject: 'Edificio' },
          { action: 'read', subject: 'Piano' },
          { action: 'read', subject: 'locale' },
          // Lettura e modifica asset (filtrati per area)
          { action: 'read', subject: 'Asset' },
          { action: 'read', subject: 'Attrezzatura' },
          { action: 'read', subject: 'StrumentoDiMisura' },
          { action: 'read', subject: 'ImpiantoTecnologico' },
          { action: 'update', subject: 'Asset' },
          { action: 'update', subject: 'Attrezzatura' },
          { action: 'update', subject: 'StrumentoDiMisura' },
          { action: 'update', subject: 'ImpiantoTecnologico' },
          // Lettura fornitori
          { action: 'read', subject: 'Fornitore' },
          // Lettura utenti (filtrati per area)
          { action: 'read', subject: 'User' }
        ]
      },
      {
        name: 'Responsabile Filiale',
        description: 'Gestione operativa della propria filiale',
        abilities: [
          // Lettura propria filiale
          { action: 'read', subject: 'Filiale', conditions: { id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'Edificio', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'Piano', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'locale', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          // Gestione asset della propria filiale
          { action: 'manage', subject: 'Asset', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'manage', subject: 'Attrezzatura', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'manage', subject: 'StrumentoDiMisura', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'manage', subject: 'ImpiantoTecnologico', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          // Lettura asset di altre filiali
          { action: 'read', subject: 'Asset' },
          { action: 'read', subject: 'Attrezzatura' },
          { action: 'read', subject: 'StrumentoDiMisura' },
          { action: 'read', subject: 'ImpiantoTecnologico' },
          // Gestione fornitori
          { action: 'read', subject: 'Fornitore' },
          { action: 'create', subject: 'Fornitore' },
          { action: 'update', subject: 'Fornitore' },
          // Gestione utenti della propria filiale
          { action: 'read', subject: 'User', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'create', subject: 'User', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'update', subject: 'User', conditions: { filiale_id: { $eq: '$user.filiale_id' } } }
        ]
      },
      {
        name: 'Responsabile Officina e Service',
        description: 'Gestione operativa delle attrezzature in officina',
        abilities: [
          // Lettura propria filiale
          { action: 'read', subject: 'Filiale', conditions: { id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'Edificio', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'Piano', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'locale', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          // Gestione asset della propria filiale
          { action: 'read', subject: 'Asset', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'update', subject: 'Asset', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'Attrezzatura', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'update', subject: 'Attrezzatura', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'StrumentoDiMisura', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'update', subject: 'StrumentoDiMisura', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'ImpiantoTecnologico', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'update', subject: 'ImpiantoTecnologico', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          // Lettura asset di altre filiali
          { action: 'read', subject: 'Asset' },
          { action: 'read', subject: 'Attrezzatura' },
          { action: 'read', subject: 'StrumentoDiMisura' },
          { action: 'read', subject: 'ImpiantoTecnologico' },
          // Gestione fornitori
          { action: 'read', subject: 'Fornitore' },
          { action: 'create', subject: 'Fornitore' },
          { action: 'update', subject: 'Fornitore' }
        ]
      },
      {
        name: 'Magazzino',
        description: 'Gestione inventario attrezzature',
        abilities: [
          // Accesso limitato all'inventario della propria filiale
          { action: 'read', subject: 'Asset', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'update', subject: 'Asset', conditions: { filiale_id: { $eq: '$user.filiale_id' } }, fields: ['scatola', 'scaffale'] },
          { action: 'read', subject: 'Attrezzatura', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'StrumentoDiMisura', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'ImpiantoTecnologico', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          // Accesso limitato alle location della propria filiale
          { action: 'read', subject: 'Filiale', conditions: { id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'Edificio', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'Piano', conditions: { filiale_id: { $eq: '$user.filiale_id' } } },
          { action: 'read', subject: 'locale', conditions: { filiale_id: { $eq: '$user.filiale_id' } } }
        ]
      }
    ];
  }

  /**
   * Carica i ruoli predefiniti nel database
   * @returns {Promise<Array>} - Ruoli creati
   */
  async seedDefaultRoles() {
    try {
      const { Role, Ability, sequelize } = require('../models');
      const createdRoles = [];
      
      // Usa una transazione per garantire atomicità
      const transaction = await sequelize.transaction();
      
      try {
        for (const roleData of this.defaultRoles) {
          logger.info(`Inizializzazione ruolo: ${roleData.name}`);
          
          // Cerca il ruolo esistente o creane uno nuovo
          let [role, created] = await Role.findOrCreate({
            where: { name: roleData.name },
            defaults: {
              description: roleData.description
            },
            transaction
          });
          
          if (created) {
            logger.info(`Creato nuovo ruolo: ${role.name}`);
          } else {
            logger.info(`Trovato ruolo esistente: ${role.name}`);
          }
          
          // Aggiorna le abilities del ruolo
          if (roleData.abilities && Array.isArray(roleData.abilities)) {
            // Rimuovi le abilities esistenti per il ruolo
            await Ability.destroy({
              where: { role_id: role.id },
              transaction
            });
            
            // Crea le nuove abilities
            for (const abilityData of roleData.abilities) {
              await Ability.create({
                role_id: role.id,
                action: abilityData.action,
                subject: abilityData.subject,
                conditions: abilityData.conditions || null,
                fields: abilityData.fields || null,
                inverted: abilityData.inverted || false,
                reason: abilityData.reason || null
              }, { transaction });
            }
            
            logger.info(`Configurate ${roleData.abilities.length} abilities per il ruolo ${role.name}`);
          }
          
          createdRoles.push(role);
        }
        
        // Commit della transazione
        await transaction.commit();
        logger.info('Inizializzazione ruoli completata con successo');
        
        return createdRoles;
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        logger.error({ err: error }, 'Errore durante l\'inizializzazione dei ruoli');
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore critico durante l\'inizializzazione dei ruoli');
      throw error;
    }
  }
}

module.exports = new PolicyBuilder();