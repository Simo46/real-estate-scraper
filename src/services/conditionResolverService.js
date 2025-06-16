// src/services/conditionResolverService.js
'use strict';

const { createLogger } = require('../utils/logger');
const logger = createLogger('services:conditionResolver');
const { get } = require('lodash');

/**
 * Servizio per la risoluzione uniforme delle condizioni dinamiche
 * Usato sia da permissionEvaluator che da abilityService
 */
class ConditionResolverService {
  /**
   * Risolve le variabili dinamiche nelle condizioni
   * @param {Object} conditions - Condizioni con potenziali variabili
   * @param {Object} context - Contesto per la risoluzione (es. utente)
   * @returns {Object} - Condizioni con variabili risolte
   */
  resolveConditions(conditions, context) {
    if (!conditions || !context) {
      return conditions;
    }
    
    // Deep clone per non modificare l'originale
    const resolvedConditions = JSON.parse(JSON.stringify(conditions));
    
    // Funzione ricorsiva per attraversare l'oggetto delle condizioni
    const traverse = (obj) => {
      for (const key in obj) {
        if (obj[key] === null || obj[key] === undefined) {
          continue;
        }
        
        // Se il valore è un oggetto, attraversalo ricorsivamente
        if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          traverse(obj[key]);
          continue;
        }
        
        // Risoluzioni speciali per operatori
        if (key.startsWith('$') && typeof obj[key] === 'string') {
          obj[key] = this.resolveSpecialOperator(key, obj[key], context);
          continue;
        }
        
        // Risoluzione standard per variabili
        if (typeof obj[key] === 'string' && this.isVariable(obj[key])) {
          obj[key] = this.resolveVariable(obj[key], context);
        }
      }
    };
    
    traverse(resolvedConditions);
    
    logger.debug(`Condizioni risolte: ${JSON.stringify(resolvedConditions)}`);
    return resolvedConditions;
  }
  
  /**
   * Controlla se una stringa è una variabile
   * @param {string} value - Valore da controllare
   * @returns {boolean} - True se è una variabile
   */
  isVariable(value) {
    return typeof value === 'string' && value.startsWith('$');
  }
  
  /**
   * Risolve una variabile nel contesto
   * @param {string} variable - Variabile da risolvere
   * @param {Object} context - Contesto per la risoluzione
   * @returns {*} - Valore risolto
   */
  resolveVariable(variable, context) {
    // Supporto per variabili nidificate come $user.settings.preference
    if (variable.startsWith('$user.')) {
      const path = variable.substring(6); // Rimuove '$user.'
      const resolvedValue = get(context, path);
      
      logger.debug(`Risoluzione variabile: ${variable} → ${JSON.stringify(resolvedValue)}`);
      
      if (resolvedValue !== undefined) {
        return resolvedValue;
      }
      
      logger.warn(`Impossibile risolvere la variabile ${variable}: percorso non trovato nell'utente`);
      return null;
    }
    
    // Altri tipi di variabili possono essere aggiunti qui
    
    return variable;
  }
  
  /**
   * Risoluzione speciale per operatori
   * @param {string} operator - Operatore ($in, $eq, ecc.)
   * @param {string} value - Valore da risolvere
   * @param {Object} context - Contesto per la risoluzione
   * @returns {*} - Valore risolto
   */
  resolveSpecialOperator(operator, value, context) {
    // Caso speciale per $in e $user.settings.managed_filiali (notazione diretta)
    if (operator === '$in' && value === '$user.settings.managed_filiali') {
      return get(context, 'settings.managed_filiali', []);
    }
    
    // Risoluzione normale per altri casi
    if (this.isVariable(value)) {
      return this.resolveVariable(value, context);
    }
    
    return value;
  }
}

module.exports = new ConditionResolverService();