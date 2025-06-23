'use strict';

const BasePolicy = require('./BasePolicy');
const { createLogger } = require('../utils/logger');
const logger = createLogger('policies:userProfile');

/**
 * Policy per il modello UserProfile
 * Gestisce autorizzazioni per profili real estate utenti
 * 
 * NOTA: user_type rimosso - si usa getUserType() dai ruoli
 */
class UserProfilePolicy extends BasePolicy {
  constructor() {
    super('UserProfile');
  }

  /**
   * Verifica se un utente può creare un profilo utente
   */
  async canCreate(user, data) {
    try {
      // AgencyAdmin può creare profili per utenti del proprio tenant
      if (user.hasRole('AgencyAdmin')) {
        return await super.canCreate(user, data);
      }

      // Un utente può creare solo il proprio profilo
      if (data.user_id && data.user_id !== user.id) {
        logger.warn(`Tentativo di creare profilo per altro utente da parte di ${user.username}`);
        return false;
      }

      // Altri utenti possono creare solo il proprio profilo
      return data.user_id === user.id || !data.user_id;
    } catch (error) {
      logger.error({ err: error }, `Errore in UserProfilePolicy.canCreate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può leggere un profilo utente
   */
  async canRead(user, userProfile = null) {
    try {
      if (!userProfile) {
        return await super.canRead(user, this.modelName);
      }

      // AgencyAdmin può leggere tutti i profili del tenant
      if (user.hasRole('AgencyAdmin')) {
        return await super.canRead(user, userProfile);
      }

      // RealEstateAgent può leggere profili pubblici del tenant
      if (user.hasRole('RealEstateAgent') && userProfile.public_profile) {
        return await super.canRead(user, userProfile);
      }

      // Buyer può leggere solo il proprio profilo
      if (user.hasRole('Buyer')) {
        return userProfile.user_id === user.id;
      }

      // Tutti possono leggere il proprio profilo
      return userProfile.user_id === user.id;
    } catch (error) {
      logger.error({ err: error }, `Errore in UserProfilePolicy.canRead per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può aggiornare un profilo utente
   */
  async canUpdate(user, userProfile, data) {
    try {
      console.log('=== DEBUG UserProfilePolicy.canUpdate ===');
      console.log('user.id:', user.id);
      console.log('userProfile.user_id:', userProfile.user_id);
      console.log('user.roles:', user.roles?.map(r => r.name));
      console.log('data:', data);
      // Non si può cambiare l'user_id del profilo
      if (data.user_id && data.user_id !== userProfile.user_id) {
        logger.warn(`Tentativo di cambiare user_id del profilo da parte di ${user.username}`);
        return false;
      }

      // AgencyAdmin può aggiornare profili del tenant (con limitazioni)
      if (user.hasRole('AgencyAdmin')) {
        // Non può modificare profili di altri AgencyAdmin o admin di sistema
        const targetUser = await userProfile.getUser({ include: ['roles'] });
        if (targetUser && targetUser.isAdmin() && targetUser.id !== user.id) {
          logger.warn(`AgencyAdmin ${user.username} ha tentato di modificare profilo admin`);
          return false;
        }
        return await super.canUpdate(user, userProfile, data);
      }

      // Gli utenti possono aggiornare solo il proprio profilo
      if (userProfile.user_id !== user.id) {
        logger.warn(`Tentativo di modificare profilo altrui da parte di ${user.username}`);
        return false;
      }

      // Verifiche sui campi sensibili
      if (data.verified !== undefined && !user.hasRole('AgencyAdmin')) {
        logger.warn(`Tentativo di auto-verificarsi da parte di ${user.username}`);
        return false;
      }

      console.log('Calling super.canUpdate...');
      const result = await super.canUpdate(user, userProfile, data);
      console.log('super.canUpdate result:', result);
      return result;
    } catch (error) {
      console.error('Error in canUpdate:', error);
      logger.error({ err: error }, `Errore in UserProfilePolicy.canUpdate per utente ${user?.id}`);
      return false;
    }
  }

  /**
   * Verifica se un utente può eliminare un profilo utente
   */
  async canDelete(user, userProfile) {
    try {
      // Solo AgencyAdmin può eliminare profili (soft delete)
      if (!user.hasRole('AgencyAdmin')) {
        logger.warn(`Tentativo di eliminare profilo senza permessi da parte di ${user.username}`);
        return false;
      }

      // Non può eliminare il proprio profilo
      if (userProfile.user_id === user.id) {
        logger.warn(`AgencyAdmin ${user.username} ha tentato di eliminare il proprio profilo`);
        return false;
      }

      // Non può eliminare profili di altri admin
      const targetUser = await userProfile.getUser({ include: ['roles'] });
      if (targetUser && targetUser.isAdmin() && targetUser.id !== user.id) {
        logger.warn(`AgencyAdmin ${user.username} ha tentato di eliminare profilo admin`);
        return false;
      }

      return await super.canDelete(user, userProfile);
    } catch (error) {
      logger.error({ err: error }, `Errore in UserProfilePolicy.canDelete per utente ${user?.id}`);
      return false;
    }
  }
}

module.exports = new UserProfilePolicy();
