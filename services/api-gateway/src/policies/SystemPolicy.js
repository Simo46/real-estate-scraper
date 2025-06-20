'use strict';

const BasePolicy = require('./BasePolicy');
const { createLogger } = require('../utils/logger');
const logger = createLogger('policies:system');

/**
 * Policy per operazioni di sistema (rate limiting, monitoring, admin tools)
 * Implementa il nuovo sistema di autorizzazione centralizzato
 */
class SystemPolicy extends BasePolicy {
  constructor() {
    super('System');
  }

  /**
   * Verifica se un utente può leggere informazioni di sistema
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} data - Dati della richiesta (opzionale)
   * @returns {boolean} - True se l'utente può leggere
   */
  async canRead(user, data) {
    try {
      // Solo amministratori di sistema possono leggere info di sistema
      if (!user.hasRole('Amministratore di Sistema')) {
        logger.warn(`Tentativo di lettura info sistema da parte di ${user.username} (non admin)`);
        return false;
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('read', user, this.modelName, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in SystemPolicy.canRead per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può gestire il sistema
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} data - Dati dell'operazione
   * @returns {boolean} - True se l'utente può gestire
   */
  async canManage(user, data) {
    try {
      // Solo amministratori di sistema possono gestire il sistema
      if (!user.hasRole('Amministratore di Sistema')) {
        logger.warn(`Tentativo di gestione sistema da parte di ${user.username} (non admin)`);
        return false;
      }
      
      // Protezioni aggiuntive per operazioni critiche
      if (data && data.operation === 'reset_all_rate_limits') {
        logger.info(`Operazione critica richiesta da ${user.username}: reset completo rate limits`);
        // Potresti aggiungere ulteriori verifiche qui (es. conferma via email, 2FA, etc.)
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('manage', user, this.modelName, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in SystemPolicy.canManage per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può creare risorse di sistema
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} data - Dati della creazione
   * @returns {boolean} - True se l'utente può creare
   */
  async canCreate(user, data) {
    try {
      // Solo amministratori di sistema possono creare risorse di sistema
      if (!user.hasRole('Amministratore di Sistema')) {
        logger.warn(`Tentativo di creazione risorsa sistema da parte di ${user.username} (non admin)`);
        return false;
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('create', user, this.modelName, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in SystemPolicy.canCreate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può aggiornare configurazioni di sistema
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} resource - Risorsa da aggiornare
   * @param {Object} data - Dati di aggiornamento
   * @returns {boolean} - True se l'utente può aggiornare
   */
  async canUpdate(user, resource, data) {
    try {
      // Solo amministratori di sistema possono aggiornare il sistema
      if (!user.hasRole('Amministratore di Sistema')) {
        logger.warn(`Tentativo di aggiornamento sistema da parte di ${user.username} (non admin)`);
        return false;
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('update', user, resource, data);
    } catch (error) {
      logger.error({ err: error }, `Errore in SystemPolicy.canUpdate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può eliminare risorse di sistema
   * @param {Object} user - Utente che effettua l'operazione
   * @param {Object} resource - Risorsa da eliminare
   * @returns {boolean} - True se l'utente può eliminare
   */
  async canDelete(user, resource) {
    try {
      // Solo amministratori di sistema possono eliminare risorse di sistema
      if (!user.hasRole('Amministratore di Sistema')) {
        logger.warn(`Tentativo di eliminazione risorsa sistema da parte di ${user.username} (non admin)`);
        return false;
      }
      
      // Protezioni aggiuntive per eliminazioni critiche
      if (resource && resource.critical === true) {
        logger.warn(`Tentativo di eliminazione risorsa critica da parte di ${user.username}`);
        // Potresti richiedere conferme aggiuntive per risorse critiche
      }
      
      // Delega la verifica al metodo base che utilizzerà le regole dal database
      return await this.can('delete', user, resource);
    } catch (error) {
      logger.error({ err: error }, `Errore in SystemPolicy.canDelete per utente ${user?.id}`);
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
      // Per le risorse di sistema, tipicamente non ci sono filtri aggiuntivi
      // Se l'utente ha accesso, può vedere tutto quello a cui è autorizzato
      return await super.getListConditions(user, existingConditions);
    } catch (error) {
      logger.error({ err: error }, `Errore in SystemPolicy.getListConditions per utente ${user?.id}`);
      return existingConditions;
    }
  }

  /**
   * Verifica permessi specifici per operazioni di rate limiting
   * @param {Object} user - Utente
   * @param {string} operation - Operazione specifica (stats, reset, config)
   * @returns {boolean} - True se l'operazione è autorizzata
   */
  async canRateLimitOperation(user, operation) {
    try {
      switch (operation) {
        case 'view_stats':
          return await this.canRead(user, { operation: 'rate_limit_stats' });
        
        case 'reset_single':
          return await this.canManage(user, { operation: 'reset_rate_limit' });
        
        case 'reset_all':
          return await this.canManage(user, { operation: 'reset_all_rate_limits' });
        
        case 'configure':
          return await this.canUpdate(user, { type: 'rate_limit_config' });
        
        default:
          logger.warn(`Operazione rate limiting non riconosciuta: ${operation}`);
          return false;
      }
    } catch (error) {
      logger.error({ err: error }, `Errore in verifica operazione rate limiting ${operation} per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica permessi per operazioni di monitoring
   * @param {Object} user - Utente
   * @param {string} operation - Operazione di monitoring
   * @returns {boolean} - True se l'operazione è autorizzata
   */
  async canMonitoringOperation(user, operation) {
    try {
      switch (operation) {
        case 'view_metrics':
        case 'view_logs':
        case 'view_health':
          return await this.canRead(user, { operation });
        
        case 'export_metrics':
        case 'clear_logs':
          return await this.canManage(user, { operation });
        
        default:
          logger.warn(`Operazione monitoring non riconosciuta: ${operation}`);
          return false;
      }
    } catch (error) {
      logger.error({ err: error }, `Errore in verifica operazione monitoring ${operation} per utente ${user?.id}`);
      return false;
    }
  }
}

module.exports = new SystemPolicy();