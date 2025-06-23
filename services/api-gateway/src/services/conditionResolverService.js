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
        
        // Risoluzione standard per variabili (supporta sia $var che ${var})
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
   * Supporta sia $var che ${var} notation
   * @param {string} value - Valore da controllare
   * @returns {boolean} - True se è una variabile
   */
  isVariable(value) {
    if (typeof value !== 'string') {
      return false;
    }
    
    // Supporta sia $user.id che ${user.id}
    return value.startsWith('$') || (value.startsWith('${') && value.endsWith('}'));
  }
  
  /**
   * Risolve una variabile nel contesto
   * Supporta sia $user.id che ${user.id} notation
   * @param {string} variable - Variabile da risolvere
   * @param {Object} context - Contesto per la risoluzione
   * @returns {*} - Valore risolto
   */
  resolveVariable(variable, context) {
    let cleanVariable = variable;
    
    // Gestisce formato ${user.id}
    if (variable.startsWith('${') && variable.endsWith('}')) {
      cleanVariable = variable.slice(2, -1); // Rimuove ${ e }
    }
    
    // Gestisce formato $user.id
    if (cleanVariable.startsWith('$')) {
      cleanVariable = cleanVariable.substring(1); // Rimuove $
    }
    
    // Supporto per variabili nidificate come user.settings.preference
    if (cleanVariable.startsWith('user.')) {
      const path = cleanVariable.substring(5); // Rimuove 'user.'
      const resolvedValue = get(context, path);
      
      logger.debug(`Risoluzione variabile: ${variable} → ${JSON.stringify(resolvedValue)}`);
      
      if (resolvedValue !== undefined) {
        return resolvedValue;
      }
      
      logger.warn(`Impossibile risolvere la variabile ${variable}: percorso non trovato nell'utente`);
      return null;
    }
    
    // Gestione diretta per 'user.id' → context.id
    if (cleanVariable === 'user.id') {
      const resolvedValue = context.id;
      logger.debug(`Risoluzione variabile: ${variable} → ${JSON.stringify(resolvedValue)}`);
      return resolvedValue;
    }
    
    // Altri tipi di variabili possono essere aggiunti qui
    logger.warn(`Tipo di variabile non riconosciuto: ${variable}`);
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