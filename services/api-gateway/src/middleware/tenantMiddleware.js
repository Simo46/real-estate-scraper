const { sequelize } = require('../models');
const models = require('../models');
const { createLogger } = require('../utils/logger');
const logger = createLogger('tenant-middleware');

const tenantMiddleware = async (req, res, next) => {
  try {
    // Log dettagliato per debugging
    logger.debug(`Ricevuta richiesta: ${req.method} ${req.url}`);
    
    // Rotte NLP usano il tenant di sistema
    if (req.url.startsWith('/api/nlp/')) {
      logger.debug('Rotta NLP: usando tenant di sistema');
      
      try {
        const systemTenant = await models.Tenant.findOne({
          where: { code: 'SYSTEM', active: true }
        });
        
        if (systemTenant) {
          logger.debug(`Tenant di sistema trovato: ${systemTenant.name} (${systemTenant.id})`);
          req.tenantId = systemTenant.id;
          req.tenant = systemTenant;
          req.sequelizeOptions = { tenantId: systemTenant.id };
          return next();
        } else {
          logger.error('Tenant di sistema non trovato per NLP service');
          return res.status(503).json({
            error: 'Service Configuration Error',
            message: 'Tenant di sistema non configurato per il servizio NLP'
          });
        }
      } catch (error) {
        logger.error('Errore durante la ricerca del tenant di sistema per NLP:', error);
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Errore durante la configurazione del tenant per il servizio NLP'
        });
      }
    }
    
    // Per test e sviluppo, accetta un header X-Tenant-ID
    const tenantIdFromHeader = req.get('X-Tenant-ID');
    
    if (tenantIdFromHeader) {
      logger.debug(`Trovato header X-Tenant-ID: ${tenantIdFromHeader}`);
      
      try {
        // Cerca il tenant usando il model direttamente
        const tenant = await models.Tenant.findByPk(tenantIdFromHeader);
        
        if (tenant) {
          logger.debug(`Tenant trovato: ${tenant.name} (${tenant.id})`);
          if (tenant.active) {
            req.tenantId = tenant.id;
            req.tenant = tenant;
            req.sequelizeOptions = { tenantId: tenant.id };
            return next();
          } else {
            logger.warn(`Tenant non attivo: ${tenant.id}`);
            return res.status(403).json({
              error: 'Tenant inactive',
              message: 'Il tenant specificato non è attivo'
            });
          }
        } else {
          logger.warn(`Tenant non trovato con ID: ${tenantIdFromHeader}`);
          return res.status(404).json({
            error: 'Tenant not found',
            message: 'Il tenant specificato non esiste'
          });
        }
      } catch (dbError) {
        logger.error({ err: dbError }, 'Errore di database durante la ricerca del tenant');
        return res.status(500).json({
          error: 'Database error',
          message: 'Errore durante la ricerca del tenant nel database',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }
    }
    
    // Procedura standard con host/subdomain se non c'è l'header
    const host = req.get('host');
    const subdomain = host.split('.')[0];
    
    logger.debug(`Cerco tenant per dominio: ${subdomain}`);
    
    try {
      const tenant = await models.Tenant.findOne({
        where: {
          domain: subdomain,
          active: true
        }
      });
      
      if (!tenant) {
        logger.warn(`Tenant non trovato per dominio: ${subdomain}`);
        return res.status(404).json({
          error: 'Tenant not found',
          message: 'Il tenant richiesto non esiste o non è attivo'
        });
      }
      
      req.tenantId = tenant.id;
      req.tenant = tenant;
      req.sequelizeOptions = { tenantId: tenant.id };
      return next();
    } catch (dbError) {
      logger.error({ err: dbError }, 'Errore di database durante la ricerca del tenant per dominio');
      return res.status(500).json({
        error: 'Database error',
        message: 'Errore durante la ricerca del tenant nel database',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Errore generale nel middleware tenant');
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Si è verificato un errore durante l\'identificazione del tenant',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = tenantMiddleware;