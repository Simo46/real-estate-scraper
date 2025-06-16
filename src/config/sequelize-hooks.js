const { createLogger } = require('../utils/logger');
const logger = createLogger('sequelize-hooks');

/**
 * Configura gli hooks di Sequelize per implementare il multi-tenancy
 * @param {Object} sequelize - Istanza Sequelize
 */
const setupTenantHooks = (sequelize) => {
  // Lista di modelli non soggetti a multi-tenancy
  const nonTenantModels = ['Tenant', 'User']; // Aggiungere altri modelli se necessario
  
  // Aggiungi tenant_id automaticamente a tutte le creazioni
  sequelize.addHook('beforeCreate', (instance, options) => {
    const modelName = instance.constructor.name;
    
    // Se non è un modello non-tenant e abbiamo un tenantId nelle options
    if (!nonTenantModels.includes(modelName) && options.tenantId) {
      logger.debug(`Adding tenantId ${options.tenantId} to ${modelName} instance`);
      instance.tenantId = options.tenantId;
    }
  });
  
  // Filtro automatico query per tenant_id
  sequelize.addHook('beforeFind', (options) => {
    // Controlla che ci sia un modello e che non sia nella lista dei non-tenant
    if (options.model && !nonTenantModels.includes(options.model.name)) {
      // Controlla se il modello ha un attributo tenantId
      const hasTenantId = Object.prototype.hasOwnProperty.call(
        options.model.rawAttributes, 
        'tenantId'
      );
      
      // Se abbiamo un tenantId nelle options e il modello ha tenantId
      if (options.tenantId && hasTenantId) {
        options.where = options.where || {};
        
        // Aggiungi il filtro per tenantId
        if (!options.where.tenantId) {
          logger.debug(`Adding tenantId ${options.tenantId} filter to ${options.model.name} query`);
          options.where.tenantId = options.tenantId;
        }
      }
    }
  });
  
  // Applica lo stesso filtro alle query di aggiornamento
  sequelize.addHook('beforeUpdate', (instance, options) => {
    const modelName = instance.constructor.name;
    
    if (!nonTenantModels.includes(modelName) && options.tenantId) {
      // Non permettere di cambiare tenantId
      if (instance.changed('tenantId')) {
        logger.warn(`Attempt to change tenantId for ${modelName}`);
        instance.previous('tenantId');
      }
    }
  });
  
  // Applica lo stesso filtro alle query di eliminazione
  sequelize.addHook('beforeBulkDestroy', (options) => {
    if (options.model && !nonTenantModels.includes(options.model.name)) {
      const hasTenantId = Object.prototype.hasOwnProperty.call(
        options.model.rawAttributes, 
        'tenantId'
      );
      
      if (options.tenantId && hasTenantId) {
        options.where = options.where || {};
        
        if (!options.where.tenantId) {
          logger.debug(`Adding tenantId ${options.tenantId} filter to ${options.model.name} bulk destroy`);
          options.where.tenantId = options.tenantId;
        }
      }
    }
  });
  
  logger.info('Tenant hooks setup completed');
};

module.exports = setupTenantHooks;