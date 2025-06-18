'use strict';

const { createLogger } = require('../utils/logger');
const logger = createLogger('services:userSettings');

/**
 * Servizio per gestire le impostazioni utente
 */
class UserSettingsService {
  /**
   * Ottiene le impostazioni auth dell'utente
   */
  getAuthSettings(user) {
    const settings = user.settings || {};
    return settings.auth || {
      default_role_id: null,
      auto_login_with_default: false,
      last_used_roles: []
    };
  }

  /**
   * Aggiorna le impostazioni auth dell'utente
   */
  async updateAuthSettings(user, newSettings) {
    const currentSettings = user.settings || {};
    const currentAuth = currentSettings.auth || {};
    
    const updatedAuth = {
      ...currentAuth,
      ...newSettings
    };

    const updatedSettings = {
      ...currentSettings,
      auth: updatedAuth
    };

    await user.update({ settings: updatedSettings });
    return updatedAuth;
  }

  /**
   * Aggiunge un ruolo alla lista dei recenti
   */
  async addToRecentRoles(user, roleId) {
    const authSettings = this.getAuthSettings(user);
    let recentRoles = authSettings.last_used_roles || [];
    
    recentRoles = recentRoles.filter(id => id !== roleId);
    recentRoles.unshift(roleId);
    recentRoles = recentRoles.slice(0, 5);

    return await this.updateAuthSettings(user, { last_used_roles: recentRoles });
  }

  /**
   * Imposta ruolo predefinito
   */
  async setDefaultRole(user, roleId) {
    return await this.updateAuthSettings(user, { default_role_id: roleId });
  }

  /**
   * Ottiene statistiche utilizzo ruoli
   */
  getRoleUsageStats(user) {
    const authSettings = this.getAuthSettings(user);
    const availableRoles = user.roles || [];
    
    return availableRoles.map(role => ({
      id: role.id,
      name: role.name,
      description: role.description,
      is_default: authSettings.default_role_id === role.id,
      is_recent: (authSettings.last_used_roles || []).includes(role.id),
      recent_position: (authSettings.last_used_roles || []).indexOf(role.id) + 1 || null
    }));
  }
}

module.exports = new UserSettingsService();