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
          { action: 'manage', subject: 'all' }
        ]
      },
      {
        name: 'System', // Per operazioni automatiche
        description: 'Utente di sistema per operazioni batch e automatiche',
        abilities: [
          { action: 'manage', subject: 'all' }
        ]
      },
      {
        name: 'User',  // Utente standard
        description: 'Utente standard che può effettuare ricerche immobiliari',
        abilities: [
          { action: 'read', subject: 'User', conditions: { id: { $eq: '$user.id' } } },
          { action: 'update', subject: 'User', conditions: { id: { $eq: '$user.id' } } },
          // Aggiungerai abilities per le entità real estate quando le creerai
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