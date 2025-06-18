'use strict';

const { AppError } = require('./errorHandler');
const permissionEvaluator = require('../services/permissionEvaluator');
const authorizationErrorService = require('../services/authorizationErrorService');
const { createLogger } = require('../utils/logger');
const logger = createLogger('middleware:policyMiddlewareFactory');
const path = require('path');
const fs = require('fs');
const FieldFilterMiddleware = require('./fieldFilterMiddleware');

/**
 * Verifica sia i campi modificabili che i permessi generali
 * @param {Object} req - Request object
 * @param {Object} policy - Policy per il tipo di risorsa
 * @param {string} action - Azione da verificare
 * @param {string} resourceType - Tipo di risorsa
 * @returns {Promise<boolean>} - True se la verifica passa
 * @throws {AppError} - Errore di autorizzazione se la verifica fallisce
 */
async function verifyPermissions(req, policy, action, resourceType) {
  // Verifica campi modificabili per operazioni di update
  if (action === 'update' && req.body) {
    const fieldCheck = await policy.verifyAllowedFields(
      req.user, 
      req.resource, 
      req.body,
      action
    );
    
    if (!fieldCheck.allowed) {
      // Verifichiamo se ci sono campi specifici non autorizzati
      if (fieldCheck.unauthorizedFields && fieldCheck.unauthorizedFields.length > 0) {
        // Errore specifico sui campi
        throw authorizationErrorService.createUnauthorizedFieldsError(
          fieldCheck.unauthorizedFields || [],
          resourceType,
          req.user
        );
      } else {
        // Errore generale di autorizzazione
        throw authorizationErrorService.createAuthorizationError(
          action,
          resourceType,
          req.user,
          { message: fieldCheck.message }
        );
      }
    }
  }
  
  // Per le operazioni di read, il filtro campi viene gestito dal FieldFilterMiddleware
  // quindi qui verifichiamo solo il permesso generale di lettura
  
  // Verifica permessi generali
  let authorized;
  switch (action) {
    case 'create':
      authorized = await policy.canCreate(req.user, req.body);
      break;
    case 'read':
      authorized = await policy.canRead(req.user, req.resource);
      break;
    case 'update':
      authorized = await policy.canUpdate(req.user, req.resource, req.body);
      break;
    case 'delete':
      authorized = await policy.canDelete(req.user, req.resource);
      break;
    case 'list':
      authorized = await policy.canList(req.user);
      break;
    default:
      authorized = await policy.can(action, req.user, req.resource);
  }
  
  if (!authorized) {
    throw authorizationErrorService.createAuthorizationError(
      action,
      resourceType,
      req.user
    );
  }
  
  return true;
}

/**
 * Factory per la creazione di middleware basati su policy
 */
const policyMiddlewareFactory = {
  /**
   * Mappa per ottenere il modello dal tipo di risorsa
   * @param {string} type - Tipo di risorsa
   * @returns {Object} - Modello Sequelize
   */
  getModelByType(type) {
    const models = require('../models');
    return models[type];
  },

  /**
   * Mappa per ottenere la policy dal tipo di risorsa
   * Implementa lazy loading per caricare le policy solo quando necessario
   * @param {string} type - Tipo di risorsa
   * @returns {Object} - Istanza della Policy
   */
  getPolicyByType(type) {
    try {
      // Converti il nome del tipo nel percorso del file della policy
      const policyName = `${type}Policy`;
      const policyPath = path.resolve(__dirname, `../policies/${policyName}`);
      
      // Controlla se il file della policy esiste
      if (!fs.existsSync(`${policyPath}.js`)) {
        logger.warn(`Policy file non trovato: ${policyPath}.js`);
        return null;
      }
      
      // Carica la policy dinamicamente
      const policy = require(policyPath);
      logger.debug(`Policy ${policyName} caricata dinamicamente`);
      
      return policy;
    } catch (err) {
      logger.error({ err }, `Errore nel recupero della policy per il tipo ${type}`);
      return null;
    }
  },

  /**
   * Genera un middleware per l'autorizzazione
   * @param {string} resourceType - Tipo di risorsa (es. 'Filiale', 'User')
   * @param {string} action - Azione (es. 'create', 'read', 'update', 'delete')
   * @param {Object} options - Opzioni aggiuntive
   * @returns {Function} - Middleware Express
   */
  create(resourceType, action, options = {}) {
    return async (req, res, next) => {
      try {
        logger.debug(`Verifica autorizzazione per ${action} su ${resourceType}`);
        
        // 1. Carica la risorsa se necessario (per operazioni su oggetti esistenti)
        if (req.params.id && ['update', 'read', 'delete'].includes(action)) {
          const Model = this.getModelByType(resourceType);
          if (!Model) {
            return next(AppError.business(`Modello ${resourceType} non trovato`));
          }
          
          const resource = await Model.findByPk(req.params.id);
          if (!resource) {
            return next(AppError.notFound(`${resourceType} non trovato`));
          }
          
          // Salva risorsa nella request per uso nei controller
          req.resource = resource;
          
          logger.debug(`Risorsa ${resourceType} (ID: ${resource.id}) caricata`);
        }
        
        // 2. Carica risorse aggiuntive se specificate nelle opzioni
        if (options.findOptions) {
          try {
            const Model = this.getModelByType(resourceType);
            if (!Model) {
              return next(AppError.business(`Modello ${resourceType} non trovato`));
            }
            
            // Risolvi eventuali funzioni dinamiche nelle where conditions
            const where = {};
            if (options.findOptions.where) {
              Object.entries(options.findOptions.where).forEach(([key, value]) => {
                where[key] = typeof value === 'function' ? value(req) : value;
              });
            }
            
            const resource = await Model.findOne({
              ...options.findOptions,
              where,
            });
            
            if (!resource) {
              return next(AppError.notFound(`${resourceType} non trovato`));
            }
            
            req.resource = resource;
          } catch (error) {
            logger.error({ err: error }, `Errore durante il caricamento della risorsa personalizzata per ${resourceType}`);
            return next(new AppError('Errore durante il caricamento della risorsa', 500));
          }
        }
        
        // 3. Ottieni policy appropriata
        const Policy = this.getPolicyByType(resourceType);
        if (!Policy) {
          return next(new AppError(`Policy per ${resourceType} non trovata`, 500));
        }
        
        // 4. Verifica autorizzazione utilizzando la funzione helper
        try {
          await verifyPermissions(req, Policy, action, resourceType);
          
          // 5. Per operazioni di lettura, applica il middleware di filtro campi
          if (['read'].includes(action)) {
            // Applica il middleware di filtro campi alla risposta
            const fieldFilterMiddleware = FieldFilterMiddleware.create(resourceType);
            fieldFilterMiddleware(req, res, () => {
              // Il middleware di filtro è stato applicato, procedi
              next();
            });
          } else {
            next();
          }
        } catch (error) {
          next(error);
        }
      } catch (error) {
        logger.error({ err: error }, `Errore durante la verifica dell'autorizzazione per ${action} su ${resourceType}`);
        next(new AppError('Errore di autorizzazione', 500));
      }
    };
  },

  /**
   * Genera un middleware per l'autorizzazione di liste
   * @param {string} resourceType - Tipo di risorsa (es. 'Filiale', 'User')
   * @param {Object} options - Opzioni aggiuntive
   * @returns {Function} - Middleware Express
   */
  createList(resourceType, options = {}) {
    return async (req, res, next) => {
      try {
        logger.debug(`Verifica autorizzazione per list su ${resourceType}`);
        
        // 1. Ottieni policy appropriata
        const Policy = this.getPolicyByType(resourceType);
        if (!Policy) {
          return next(new AppError(`Policy per ${resourceType} non trovata`, 500));
        }
        
        // 2. Verifica se l'utente è autorizzato per l'azione di lettura usando la funzione helper
        try {
          await verifyPermissions(req, Policy, 'list', resourceType);
          
          // 3. Se richiesto, applica filtri di autorizzazione alle queries
          if (options.applyFilters) {
            let existingWhere = {};
          
            // Se ci sono condizioni aggiuntive, applicale
            if (options.additionalConditions) {
              if (typeof options.additionalConditions === 'function') {
                existingWhere = options.additionalConditions(req);
              } else {
                existingWhere = options.additionalConditions;
              }
            }
            
            const permissionFilter = await Policy.getListConditions(req.user, existingWhere);
            
            if (permissionFilter) {
              req.queryOptions = req.queryOptions || {};
              req.queryOptions.where = permissionFilter;
            }
          }
          
          // 4. CORREZIONE: Applica SEMPRE il middleware di filtro campi per le liste
          logger.debug(`Applicazione filtro campi per lista ${resourceType}`);
          const fieldFilterMiddleware = FieldFilterMiddleware.create(resourceType);
          fieldFilterMiddleware(req, res, () => {
            // Il middleware di filtro è stato applicato, procedi
            next();
          });
        } catch (error) {
          next(error);
        }
      } catch (error) {
        logger.error({ err: error }, `Errore durante la verifica dell'autorizzazione per list su ${resourceType}`);
        next(new AppError('Errore di autorizzazione', 500));
      }
    };
  },

  /**
   * Middleware per operazioni di sola lettura senza verifiche di permesso
   * @param {string} resourceType - Tipo di risorsa
   * @param {Object} options - Opzioni aggiuntive
   * @returns {Function} - Middleware Express
   */
  createReadOnly(resourceType, options = {}) {
    return async (req, res, next) => {
      try {
        logger.debug(`Middleware di sola lettura per ${resourceType}`);
        
        // 1. Carica la risorsa se richiesto
        if (req.params.id && options.loadResource !== false) {
          const Model = this.getModelByType(resourceType);
          if (!Model) {
            return next(AppError.business(`Modello ${resourceType} non trovato`));
          }
          
          const resource = await Model.findByPk(req.params.id);
          if (!resource) {
            return next(AppError.notFound(`${resourceType} non trovato`));
          }
          
          req.resource = resource;
        }
        
        // 2. Applica il middleware di filtro campi
        const fieldFilterMiddleware = FieldFilterMiddleware.create(resourceType);
        fieldFilterMiddleware(req, res, () => {
          next();
        });
      } catch (error) {
        logger.error({ err: error }, `Errore nel middleware di sola lettura per ${resourceType}`);
        next(new AppError('Errore di autorizzazione', 500));
      }
    };
  }
};

module.exports = policyMiddlewareFactory;