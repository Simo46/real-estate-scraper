'use strict';

const { createLogger } = require('../utils/logger');
const logger = createLogger('middleware:fieldFilter');

/**
 * Middleware per filtrare i campi nelle risposte basandosi sui permessi dell'utente
 * Questo middleware intercetta res.json() e filtra automaticamente i campi
 * in base alle restrizioni definite nelle abilities dell'utente
 */
class FieldFilterMiddleware {
  /**
   * Crea un middleware per filtrare i campi nelle risposte
   * @param {string} resourceType - Tipo di risorsa da filtrare
   * @returns {Function} - Middleware Express
   */
  static create(resourceType) {
    return async (req, res, next) => {
      // Salva il metodo res.json originale
      const originalJson = res.json.bind(res);
      
      // Override del metodo res.json per applicare il filtro
      res.json = async function(data) {
        try {
          // Applica il filtro solo se l'utente è autenticato e ci sono dati
          if (req.user && data) {
            const filteredData = await FieldFilterMiddleware.filterResponse(
              data, 
              req.user, 
              resourceType,
              req.resource
            );
            return originalJson(filteredData);
          }
          
          // Senza utente o dati, restituisci i dati originali
          return originalJson(data);
        } catch (error) {
          logger.error({ 
            err: error, 
            resourceType, 
            userId: req.user?.id 
          }, `Errore durante il filtro dei campi`);
          
          // In caso di errore, restituisci i dati originali per non bloccare la risposta
          return originalJson(data);
        }
      };
      
      next();
    };
  }
  
  /**
   * Filtra la risposta identificando e processando correttamente i dati della risorsa
   * @param {Object|Array} responseData - Dati della risposta completa
   * @param {Object} user - Utente
   * @param {string} resourceType - Tipo di risorsa
   * @param {Object} resource - Risorsa specifica (opzionale)
   * @returns {Object|Array} - Dati filtrati
   */
  static async filterResponse(responseData, user, resourceType, resource = null) {
    logger.debug(`[DEBUG] Starting filterResponse for ${resourceType}`);
    
    // Verifica se esistono restrizioni sui campi per questo tipo di risorsa
    const allowedFields = await this.getAllowedFields(user, resourceType, resource);
    
    logger.debug(`[DEBUG] Allowed fields result: ${allowedFields ? JSON.stringify(allowedFields) : 'null (all fields allowed)'}`);
    
    // Se non ci sono restrizioni, restituisci i dati originali
    if (!allowedFields) {
      logger.debug(`[DEBUG] No field restrictions for ${resourceType}, returning original data`);
      return responseData;
    }
    
    logger.debug(`[DEBUG] Applying field filter for ${resourceType}: ${allowedFields.join(', ')}`);
    
    // Identifica e filtra i dati della risorsa nella struttura di risposta
    return this.processResponseStructure(responseData, allowedFields, resourceType);
  }
  
  /**
   * Processa la struttura della risposta e filtra i dati appropriati
   * @param {*} data - Dati da processare
   * @param {Array} allowedFields - Campi consentiti
   * @param {string} resourceType - Tipo di risorsa per identificazione pattern
   * @returns {*} - Dati processati
   */
  static processResponseStructure(data, allowedFields, resourceType) {
    logger.debug(`[DEBUG] Processing response structure - Type: ${Array.isArray(data) ? 'array' : typeof data}`);
    logger.debug(`[DEBUG] Data keys: ${data && typeof data === 'object' ? Object.keys(data).join(', ') : 'N/A'}`);
    
    if (!data || typeof data !== 'object') {
      logger.debug('[DEBUG] Data is not object, returning as is');
      return data;
    }
    
    // Caso 1: Array di oggetti risorsa (es. lista di filiali)
    if (Array.isArray(data)) {
      logger.debug('[DEBUG] Processing array of resources');
      return data.map(item => this.filterResourceObject(item, allowedFields));
    }
    
    // Caso 2: Struttura di risposta standard con wrapper
    if (this.isResponseWrapper(data)) {
      logger.debug('[DEBUG] Detected response wrapper structure');
      return this.filterResponseWrapper(data, allowedFields, resourceType);
    }
    
    // Caso 3: Oggetto risorsa diretto
    if (this.isResourceObject(data)) {
      logger.debug('[DEBUG] Detected direct resource object');
      return this.filterResourceObject(data, allowedFields);
    }
    
    // Caso 4: Potenziale struttura nidificata (es. { filiali: [...] })
    const nestedResourceKey = this.findNestedResourceKey(data, resourceType);
    if (nestedResourceKey) {
      logger.debug(`[DEBUG] Detected nested resource structure with key: ${nestedResourceKey}`);
      return this.filterNestedResourceStructure(data, allowedFields, nestedResourceKey);
    }
    
    // Caso 5: Oggetto sconosciuto - non filtrare
    logger.debug('[DEBUG] Unknown object structure, returning as is');
    return data;
  }
  
  /**
   * Trova la chiave che contiene la risorsa nidificata
   * @param {Object} data - Dati da verificare
   * @param {string} resourceType - Tipo di risorsa
   * @returns {string|null} - Chiave trovata o null
   */
  static findNestedResourceKey(data, resourceType) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      logger.debug('[DEBUG] findNestedResourceKey: not an object');
      return null;
    }
    
    // Genera tutti i possibili nomi della chiave basati sul resourceType
    const possibleKeys = this.generateResourceKeys(resourceType);
    
    logger.debug(`[DEBUG] Looking for nested resource keys: ${possibleKeys.join(', ')}`);
    
    for (const key of possibleKeys) {
      if (data.hasOwnProperty(key) && data[key]) {
        logger.debug(`[DEBUG] Checking key: ${key}, value type: ${Array.isArray(data[key]) ? 'array' : typeof data[key]}`);
        
        // Verifica che il valore sia un array o un oggetto risorsa
        if (Array.isArray(data[key]) || this.isResourceObject(data[key])) {
          logger.debug(`[DEBUG] Found nested resource key: ${key}`);
          return key;
        }
      }
    }
    
    logger.debug('[DEBUG] No nested resource key found');
    return null;
  }
  
  /**
   * Genera tutte le possibili chiavi per una risorsa
   * @param {string} resourceType - Tipo di risorsa
   * @returns {Array} - Array di possibili chiavi
   */
  static generateResourceKeys(resourceType) {
    const baseKey = resourceType.toLowerCase();
    const keys = [baseKey];
    
    // Aggiungi varianti plurali italiane
    if (baseKey.endsWith('a')) {
      // filiale -> filiali
      keys.push(baseKey.slice(0, -1) + 'i');
    } else if (baseKey.endsWith('e')) {
      // attrezzature -> attrezzaturi (se applicabile)
      keys.push(baseKey.slice(0, -1) + 'i');
    } else if (baseKey.endsWith('o')) {
      // edificio -> edifici
      keys.push(baseKey.slice(0, -1) + 'i');
    } else {
      // Plurale generico aggiungendo 'i'
      keys.push(baseKey + 'i');
    }
    
    // Aggiungi plurale inglese
    keys.push(baseKey + 's');
    
    // Aggiungi chiavi comuni
    keys.push('items', 'records', 'data', 'results');
    
    // Rimuovi duplicati e restituisci
    return [...new Set(keys)];
  }
  
  /**
   * Filtra una struttura nidificata contenente la risorsa
   * @param {Object} data - Dati con struttura nidificata
   * @param {Array} allowedFields - Campi consentiti
   * @param {string} resourceKey - Chiave della risorsa
   * @returns {Object} - Dati con risorsa filtrata
   */
  static filterNestedResourceStructure(data, allowedFields, resourceKey) {
    const result = { ...data };
    
    logger.debug(`[DEBUG] Filtering nested resource with key: ${resourceKey}`);
    logger.debug(`[DEBUG] Allowed fields: ${allowedFields.join(', ')}`);
    
    if (Array.isArray(data[resourceKey])) {
      // Se è un array di risorse
      const originalCount = data[resourceKey].length;
      logger.debug(`[DEBUG] Processing array of ${originalCount} items`);
      
      result[resourceKey] = data[resourceKey].map((item, index) => {
        logger.debug(`[DEBUG] Processing item ${index}: keys = ${Object.keys(item).join(', ')}`);
        const filtered = this.filterResourceObject(item, allowedFields);
        logger.debug(`[DEBUG] Filtered item ${index}: keys = ${Object.keys(filtered).join(', ')}`);
        return filtered;
      });
      
      logger.debug(`[DEBUG] Filtered array: ${originalCount} items processed`);
    } else if (data[resourceKey] && typeof data[resourceKey] === 'object') {
      // Se è una singola risorsa
      const originalKeys = Object.keys(data[resourceKey]).length;
      result[resourceKey] = this.filterResourceObject(data[resourceKey], allowedFields);
      const filteredKeys = Object.keys(result[resourceKey]).length;
      logger.debug(`[DEBUG] Filtered single resource: ${originalKeys} -> ${filteredKeys} fields`);
    }
    
    return result;
  }
  
  /**
   * Verifica se l'oggetto è un wrapper di risposta standard
   * @param {Object} data - Dati da verificare
   * @returns {boolean} - True se è un wrapper di risposta
   */
  static isResponseWrapper(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return false;
    }
    
    // Strutture comuni: { status, data }, { status, results }, { success, data }
    const hasStatus = data.hasOwnProperty('status') || data.hasOwnProperty('success');
    const hasDataProperty = data.hasOwnProperty('data') || 
                           data.hasOwnProperty('results') || 
                           data.hasOwnProperty('items');
    
    const isWrapper = hasStatus && hasDataProperty;
    logger.debug(`[DEBUG] isResponseWrapper check: hasStatus=${hasStatus}, hasDataProperty=${hasDataProperty}, result=${isWrapper}`);
    
    return isWrapper;
  }
  
  /**
   * Verifica se l'oggetto è direttamente un oggetto risorsa
   * @param {Object} data - Dati da verificare
   * @returns {boolean} - True se è un oggetto risorsa
   */
  static isResourceObject(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return false;
    }
    
    // Verifica presenza di campi tipici di una risorsa
    const hasResourceFields = data.hasOwnProperty('id') || 
                              data.hasOwnProperty('created_at') || 
                              data.hasOwnProperty('updated_at') ||
                              data.hasOwnProperty('createdAt') || 
                              data.hasOwnProperty('updatedAt');
    
    // Assicurati che NON sia un wrapper di risposta
    const isWrapper = this.isResponseWrapper(data);
    
    const result = hasResourceFields && !isWrapper;
    logger.debug(`[DEBUG] isResourceObject: hasResourceFields=${hasResourceFields}, isWrapper=${isWrapper}, result=${result}`);
    
    return result;
  }
  
  /**
   * Filtra un wrapper di risposta, applicando il filtro solo ai dati della risorsa
   * @param {Object} wrapper - Wrapper di risposta
   * @param {Array} allowedFields - Campi consentiti
   * @param {string} resourceType - Tipo di risorsa
   * @returns {Object} - Wrapper con dati filtrati
   */
  static filterResponseWrapper(wrapper, allowedFields, resourceType) {
    logger.debug(`[DEBUG] Filtering response wrapper with properties: ${Object.keys(wrapper).join(', ')}`);
    
    const result = { ...wrapper };
    
    // Identifica la proprietà contenente i dati della risorsa
    const dataProperties = ['data', 'results', 'items'];
    
    for (const prop of dataProperties) {
      if (wrapper.hasOwnProperty(prop)) {
        logger.debug(`[DEBUG] Found data property: ${prop}`);
        logger.debug(`[DEBUG] Original ${prop} structure:`, typeof wrapper[prop] === 'object' ? Object.keys(wrapper[prop] || {}) : wrapper[prop]);
        
        result[prop] = this.processResponseStructure(wrapper[prop], allowedFields, resourceType);
        
        logger.debug(`[DEBUG] Filtered ${prop} structure:`, typeof result[prop] === 'object' ? Object.keys(result[prop] || {}) : result[prop]);
        break;
      }
    }
    
    return result;
  }
  
  /**
   * Filtra un singolo oggetto risorsa
   * @param {Object} obj - Oggetto da filtrare
   * @param {Array} allowedFields - Campi consentiti
   * @returns {Object} - Oggetto filtrato
   */
  static filterResourceObject(obj, allowedFields) {
    logger.debug(`[DEBUG] === filterResourceObject START ===`);
    logger.debug(`[DEBUG] Input object keys: ${obj && typeof obj === 'object' ? Object.keys(obj).join(', ') : 'N/A'}`);
    logger.debug(`[DEBUG] Allowed fields: ${allowedFields.join(', ')}`);
    
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      logger.debug('[DEBUG] Object is not suitable for filtering, returning as is');
      return obj;
    }

    // CORREZIONE: Gestisci oggetti Sequelize
    let workingObject = obj;
    
    // Se l'oggetto ha metodi Sequelize, estrai i dati puliti
    if (typeof obj.get === 'function') {
      logger.debug('[DEBUG] Detected Sequelize object, extracting clean data with .get()');
      workingObject = obj.get({ plain: true });
      logger.debug(`[DEBUG] Extracted clean object keys: ${Object.keys(workingObject).join(', ')}`);
    } else if (typeof obj.toJSON === 'function') {
      logger.debug('[DEBUG] Detected object with toJSON(), extracting clean data');
      workingObject = obj.toJSON();
      logger.debug(`[DEBUG] Extracted clean object keys: ${Object.keys(workingObject).join(', ')}`);
    } else if (obj.dataValues && typeof obj.dataValues === 'object') {
      logger.debug('[DEBUG] Detected Sequelize-like object with dataValues, extracting');
      workingObject = obj.dataValues;
      logger.debug(`[DEBUG] Extracted dataValues keys: ${Object.keys(workingObject).join(', ')}`);
    }
    
    const filtered = {};
    
    // Campi essenziali sempre inclusi
    const essentialFields = ['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt'];
    const allAllowedFields = [...new Set([...allowedFields, ...essentialFields])];
    
    logger.debug(`[DEBUG] All allowed fields (including essential): ${allAllowedFields.join(', ')}`);
    
    // Filtra i campi uno per uno con debug dettagliato
    allAllowedFields.forEach(field => {
      if (workingObject.hasOwnProperty(field)) {
        filtered[field] = workingObject[field];
        logger.debug(`[DEBUG] ✓ Included field: ${field} = ${JSON.stringify(workingObject[field])}`);
      } else {
        logger.debug(`[DEBUG] ✗ Field not found in object: ${field}`);
      }
    });
    
    // Gestione campi nidificati (es. "profile.name")
    allowedFields.forEach(field => {
      if (field.includes('.')) {
        const [rootField] = field.split('.');
        if (workingObject.hasOwnProperty(rootField) && !filtered.hasOwnProperty(rootField)) {
          // Per ora includiamo l'intero oggetto nidificato
          // Una versione futura potrebbe filtrare ricorsivamente
          filtered[rootField] = workingObject[rootField];
          logger.debug(`[DEBUG] ✓ Included nested field: ${rootField}`);
        }
      }
    });
    
    logger.debug(`[DEBUG] Final filtered object keys: ${Object.keys(filtered).join(', ')}`);
    logger.debug(`[DEBUG] Filtering result: ${Object.keys(workingObject).length} -> ${Object.keys(filtered).length} fields`);
    logger.debug(`[DEBUG] === filterResourceObject END ===`);
    
    return filtered;
  }
  
  /**
   * Ottiene i campi consentiti per la lettura dall'utente
   * @param {Object} user - Utente
   * @param {string} resourceType - Tipo di risorsa
   * @param {Object} resource - Risorsa specifica (opzionale)
   * @returns {Array|null} - Array dei campi consentiti o null se tutti sono consentiti
   */
  static async getAllowedFields(user, resourceType, resource = null) {
    try {
      // Tenta di caricare la policy specifica
      const policy = this.loadPolicy(resourceType);
      
      // Se la policy ha il metodo getAllowedReadFields, usalo
      if (policy && typeof policy.getAllowedReadFields === 'function') {
        const result = await policy.getAllowedReadFields(user, resource);
        logger.debug(`[DEBUG] Policy getAllowedReadFields returned: ${result ? JSON.stringify(result) : 'null'}`);
        return result;
      }
      
      // Fallback: usa direttamente il sistema CASL
      const result = await this.getAllowedFieldsFallback(user, resourceType);
      logger.debug(`[DEBUG] Fallback getAllowedFields returned: ${result ? JSON.stringify(result) : 'null'}`);
      return result;
    } catch (error) {
      logger.error({ 
        err: error, 
        resourceType, 
        userId: user?.id 
      }, `Errore nel recupero dei campi consentiti`);
      
      // In caso di errore, consenti tutti i campi per sicurezza
      return null;
    }
  }
  
  /**
   * Carica dinamicamente la policy per il tipo di risorsa
   * @param {string} resourceType - Tipo di risorsa
   * @returns {Object|null} - Istanza della policy o null se non trovata
   */
  static loadPolicy(resourceType) {
    try {
      const path = require('path');
      const fs = require('fs');
      
      const policyPath = path.resolve(__dirname, `../policies/${resourceType}Policy.js`);
      
      if (fs.existsSync(policyPath)) {
        return require(policyPath);
      }
      
      return null;
    } catch (error) {
      logger.debug(`Impossibile caricare policy per ${resourceType}: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Metodo di fallback per ottenere i campi consentiti usando direttamente CASL
   * @param {Object} user - Utente
   * @param {string} resourceType - Tipo di risorsa
   * @returns {Array|null} - Array dei campi consentiti o null se tutti sono consentiti
   */
  static async getAllowedFieldsFallback(user, resourceType) {
    try {
      const abilityService = require('../services/abilityService');
      const ability = await abilityService.defineAbilityFor(user);
      
      // Ottieni tutte le regole per la lettura di questo tipo di risorsa
      const rules = ability.rulesFor('read', resourceType);
      
      logger.debug(`[DEBUG] Rules found for read on ${resourceType}: ${rules.length}`);
      
      // Dividi le regole in quelle con fields e quelle senza
      const rulesWithFields = rules.filter(rule => 
        !rule.inverted && rule.fields && Array.isArray(rule.fields) && rule.fields.length > 0
      );
      
      const rulesWithoutFields = rules.filter(rule => 
        !rule.inverted && (!rule.fields || rule.fields.length === 0)
      );
      
      logger.debug(`[DEBUG] Rules with fields: ${rulesWithFields.length}, without fields: ${rulesWithoutFields.length}`);
      
      // Se non ci sono regole con restrizioni sui campi, tutti sono consentiti
      if (rulesWithFields.length === 0) {
        logger.debug(`[DEBUG] No field restrictions, all fields allowed`);
        return null;
      }
      
      // Se ci sono sia regole con fields che senza fields, 
      // dobbiamo trovare quella con priorità più alta
      const allApplicableRules = [...rulesWithFields, ...rulesWithoutFields];
      
      // Ordina per priorità decrescente (priorità più alta prima)
      allApplicableRules.sort((a, b) => (b.priority || 1) - (a.priority || 1));
      
      logger.debug(`[DEBUG] Rules sorted by priority:`, allApplicableRules.map(r => ({
        priority: r.priority || 1,
        hasFields: !!r.fields,
        fields: r.fields
      })));
      
      // Prendi la regola con priorità più alta
      const highestPriorityRule = allApplicableRules[0];
      
      // Se la regola con priorità più alta non ha fields, tutti i campi sono consentiti
      if (!highestPriorityRule.fields || highestPriorityRule.fields.length === 0) {
        logger.debug(`[DEBUG] Highest priority rule has no field restrictions`);
        return null;
      }
      
      // Altrimenti, usa i campi della regola con priorità più alta
      const allowedFields = [...highestPriorityRule.fields];
      logger.debug(`[DEBUG] Fields allowed by highest priority rule: ${allowedFields.join(', ')}`);
      
      return allowedFields;
    } catch (error) {
      logger.error({ 
        err: error, 
        resourceType, 
        userId: user?.id 
      }, `Errore nel fallback per i campi consentiti`);
      
      return null;
    }
  }
}

module.exports = FieldFilterMiddleware;