'use strict';

const BasePolicy = require('./BasePolicy');
const { createLogger } = require('../utils/logger');
const logger = createLogger('policies:role');

/**
 * Policy per il modello Role
 * Implementa il nuovo sistema di autorizzazione centralizzato
 */
class RolePolicy extends BasePolicy {
  constructor() {
    super('Role');
  }

  /**
   * Verifica se un utente può creare un nuovo ruolo
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} data - Dati del nuovo ruolo
   * @returns {boolean} - True se l'utente può creare
   */
  async canCreate(user, data) {
    try {
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('create', user, this.modelName, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in RolePolicy.canCreate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può leggere un ruolo
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} role - Ruolo da leggere
   * @returns {boolean} - True se l'utente può leggere
   */
  async canRead(user, role) {
    try {
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('read', user, role);
    } catch (error) {
      logger.error({ err: error }, `Errore in RolePolicy.canRead per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può aggiornare un ruolo
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} role - Ruolo da aggiornare
   * @param {Object} data - Dati di aggiornamento
   * @returns {boolean} - True se l'utente può aggiornare
   */
  async canUpdate(user, role, data) {
    try {
      // Protezione aggiuntiva per il ruolo amministratore
      if (role.name === 'Amministratore di Sistema') {
        // Se sta cercando di modificare le abilità del ruolo amministratore
        if (data.abilities && Array.isArray(data.abilities)) {
          logger.warn(`Tentativo di modificare abilità del ruolo amministratore da parte di ${user.username}`);
          return false;
        }
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('update', user, role, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in RolePolicy.canUpdate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può eliminare un ruolo
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} role - Ruolo da eliminare
   * @returns {boolean} - True se l'utente può eliminare
   */
  async canDelete(user, role) {
    try {
      // Non consentire l'eliminazione dei ruoli predefiniti del sistema
      const systemRoles = [
        'Amministratore di Sistema', 
        'Ufficio Tecnico', 
        'Ufficio Post Vendita', 
        'Area Manager', 
        'Responsabile Filiale', 
        'Responsabile Officina e Service', 
        'Magazzino'
      ];
      
      if (systemRoles.includes(role.name)) {
        logger.warn(`Tentativo di eliminare ruolo predefinito ${role.name} da parte di ${user.username}`);
        return false;
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('delete', user, role);
    } catch (error) {
      logger.error({ err: error }, `Errore in RolePolicy.canDelete per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Ottiene le condizioni di filtro per operazioni di elenco
   * @param {Object} user - Utente
   * @param {Object} existingConditions - Condizioni esistenti (opzionale)
   * @returns {Object} Condizioni combinate per filtrare le risorse
   */
  async getListConditions(user, existingConditions = {}) {
    try {
      return await super.getListConditions(user, existingConditions);
    } catch (error) {
      logger.error({ err: error }, `Errore in RolePolicy.getListConditions per utente ${user?.id}`);
      return existingConditions;
    }
  }
}

module.exports = new RolePolicy();