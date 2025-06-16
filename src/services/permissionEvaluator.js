/**
 * Service per la valutazione avanzata dei permessi
 * Estrae la logica di interpretazione delle regole di permesso
 * per rendere più semplice la gestione di condizioni complesse
 */
'use strict';

const { createLogger } = require('../utils/logger');
const logger = createLogger('services:permissionEvaluator');
const { get } = require('lodash');
const { Op } = require('sequelize');
const conditionResolverService = require('./conditionResolverService');

/**
 * Servizio per la valutazione avanzata dei permessi
 * Gestisce la risoluzione di variabili dinamiche e la valutazione di condizioni complesse
 */
class PermissionEvaluator {
  constructor() {
    // MongoDB operators supportati
    this.supportedOperators = {
      $eq: this._evaluateEqual,
      $ne: this._evaluateNotEqual,
      $gt: this._evaluateGreaterThan,
      $gte: this._evaluateGreaterThanOrEqual,
      $lt: this._evaluateLessThan,
      $lte: this._evaluateLessThanOrEqual,
      $in: this._evaluateIn,
      $nin: this._evaluateNotIn,
      $all: this._evaluateAll,
      $size: this._evaluateSize,
      $regex: this._evaluateRegex,
      $exists: this._evaluateExists,
      $elemMatch: this._evaluateElemMatch
    };
  }

  /**
   * Valuta un set di regole di permesso
   * @param {Object} user - Utente che richiede l'accesso
   * @param {string} action - Azione da eseguire (create, read, update, delete)
   * @param {Object|string} subject - Oggetto o tipo di oggetto su cui eseguire l'azione
   * @param {Object} data - Dati aggiuntivi per l'azione (opzionale)
   * @returns {boolean} True se l'utente può eseguire l'azione
   */
  evaluate(user, action, subject, data = {}) {
    try {
      // Ottenere l'ability da abilityService può essere fatto qui o passato come parametro
      // Per ora assumiamo che venga passato l'oggetto ability direttamente
      
      // Questo è un segnaposto. L'ability sarà fornita dal abilityService nella fase 3
      // quando modificheremo BasePolicy
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la valutazione dei permessi');
      return false;
    }
  }

  /**
   * Risolve variabili dinamiche nelle condizioni
   * Sostituisce variabili come $user.filiale_id con il valore effettivo dall'oggetto user
   * @param {Object} conditions - Condizioni da risolvere
   * @param {Object} user - Utente di cui risolvere le variabili
   * @returns {Object} Condizioni con variabili risolte
   */
  resolveDynamicConditions(conditions, user) {
    try {
      // Usa il servizio centralizzato per risolvere le condizioni
      return conditionResolverService.resolveConditions(conditions, user);
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la risoluzione delle condizioni dinamiche');
      return conditions; // In caso di errore, restituisci le condizioni originali
    }
  }

  /**
   * Valuta una singola regola di permesso
   * @param {Object} rule - Regola da valutare
   * @param {Object} user - Utente che richiede l'accesso
   * @param {Object} resource - Risorsa su cui applicare la regola
   * @returns {boolean} True se la regola è soddisfatta
   */
  evaluateRule(rule, user, resource) {
    try {
      // Se la regola non ha condizioni, ritorna true (si applica a tutto)
      if (!rule.conditions) {
        return true;
      }
      
      // Risolvi le variabili dinamiche nelle condizioni usando il servizio centralizzato
      const resolvedConditions = conditionResolverService.resolveConditions(rule.conditions, user);
      
      // Valuta le condizioni risolte rispetto alla risorsa
      return this.evaluateConditions(resolvedConditions, resource);
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la valutazione della regola');
      return false;
    }
  }

  /**
   * Valuta un set di regole considerando priorità
   * @param {Array} rules - Regole da valutare
   * @param {Object} user - Utente che richiede l'accesso
   * @param {Object} resource - Risorsa su cui applicare le regole
   * @returns {boolean} True se le regole consentono l'accesso
   */
  evaluateRules(rules, user, resource) {
    try {
      if (!rules || rules.length === 0) {
        return false;
      }
      
      // Ordina regole per priorità (decrescente)
      const sortedRules = [...rules].sort((a, b) => {
        // Priorità è un valore numerico, più alto = più prioritario
        const priorityA = a.priority || 1;
        const priorityB = b.priority || 1;
        return priorityB - priorityA;
      });
      
      // Dividi regole in can e cannot
      const canRules = sortedRules.filter(rule => !rule.inverted);
      const cannotRules = sortedRules.filter(rule => rule.inverted);
      
      // Applica prima le regole can
      let allowAccess = false;
      for (const rule of canRules) {
        if (this.evaluateRule(rule, user, resource)) {
          allowAccess = true;
          break;
        }
      }
      
      // Se nessuna regola can consente l'accesso, non c'è bisogno di verificare le cannot
      if (!allowAccess) {
        return false;
      }
      
      // Verifica se una qualsiasi regola cannot nega l'accesso
      for (const rule of cannotRules) {
        if (this.evaluateRule(rule, user, resource)) {
          // Se una regola cannot si applica, nega l'accesso
          return false;
        }
      }
      
      // Nessuna regola cannot si applica, consenti l'accesso
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la valutazione delle regole');
      return false;
    }
  }

  /**
   * Valuta condizioni MongoDB-like rispetto a una risorsa
   * @param {Object} conditions - Condizioni da valutare
   * @param {Object} resource - Risorsa da confrontare con le condizioni
   * @returns {boolean} True se le condizioni sono soddisfatte
   */
  evaluateConditions(conditions, resource) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true;
    }
    
    if (!resource) {
      return false;
    }
    
    // Verifica tutte le condizioni (logica AND tra campi)
    for (const key in conditions) {
      const condition = conditions[key];
      const resourceValue = this._getResourceValue(resource, key);
      
      if (!this._evaluateCondition(condition, resourceValue)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Valuta una singola condizione su un valore
   * @param {*} condition - Condizione da valutare
   * @param {*} value - Valore con cui confrontare la condizione
   * @returns {boolean} True se la condizione è soddisfatta
   * @private
   */
  _evaluateCondition(condition, value) {
    // Se condition è un operatore MongoDB (oggetto con chiavi che iniziano con $)
    if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
      const operatorKeys = Object.keys(condition).filter(k => k.startsWith('$'));
      
      if (operatorKeys.length > 0) {
        // Logica AND tra operatori per lo stesso campo
        for (const opKey of operatorKeys) {
          const opFn = this.supportedOperators[opKey];
          
          if (!opFn) {
            logger.warn(`Operatore non supportato: ${opKey}`);
            return false;
          }
          
          if (!opFn.call(this, condition[opKey], value)) {
            return false;
          }
        }
        
        return true;
      }
      
      // Se è un oggetto ma non ha operatori, verifica uguaglianza profonda
      if (Array.isArray(value)) {
        // Se value è un array, cerca se contiene elementi che corrispondono
        return value.some(item => this._deepEqual(item, condition));
      }
      
      return this._deepEqual(value, condition);
    }
    
    // Se condition non è un operatore, verifica uguaglianza semplice
    if (Array.isArray(value)) {
      return value.includes(condition);
    }
    
    return value === condition;
  }

  /**
   * Ottiene il valore di un campo dalla risorsa, supportando notazione con punti
   * @param {Object} resource - Risorsa da cui estrarre il valore
   * @param {string} path - Percorso del campo, supporta notazione con punti per campi annidati
   * @returns {*} Valore del campo
   * @private
   */
  _getResourceValue(resource, path) {
    // Gestisci caso in cui resource è un modello Sequelize
    if (resource && typeof resource.get === 'function') {
      // Se il percorso contiene punti, potrebbe essere un campo annidato
      if (path.includes('.')) {
        // Inizia con il valore base del modello
        let obj = resource.toJSON();
        const parts = path.split('.');
        
        for (let i = 0; i < parts.length - 1; i++) {
          if (obj && typeof obj === 'object') {
            obj = obj[parts[i]];
          } else {
            return undefined;
          }
        }
        
        return obj ? obj[parts[parts.length - 1]] : undefined;
      }
      
      // Campo semplice
      return resource.get(path);
    }
    
    // Gestisci il caso di oggetti semplici con campi annidati
    return get(resource, path);
  }

  /**
   * Verifica uguaglianza profonda tra due valori
   * @param {*} a - Primo valore
   * @param {*} b - Secondo valore
   * @returns {boolean} True se i valori sono uguali
   * @private
   */
  _deepEqual(a, b) {
    if (a === b) return true;
    
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
      return false;
    }
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (!keysB.includes(key) || !this._deepEqual(a[key], b[key])) {
        return false;
      }
    }
    
    return true;
  }

  // --- Implementazione operatori MongoDB ---

  /**
   * Valuta operatore $eq (equal)
   * @param {*} conditionValue - Valore della condizione
   * @param {*} resourceValue - Valore della risorsa
   * @returns {boolean} True se i valori sono uguali
   * @private
   */
  _evaluateEqual(conditionValue, resourceValue) {
    if (Array.isArray(resourceValue)) {
      return resourceValue.includes(conditionValue);
    }
    return resourceValue === conditionValue;
  }

  /**
   * Valuta operatore $ne (not equal)
   * @param {*} conditionValue - Valore della condizione
   * @param {*} resourceValue - Valore della risorsa
   * @returns {boolean} True se i valori sono diversi
   * @private
   */
  _evaluateNotEqual(conditionValue, resourceValue) {
    if (Array.isArray(resourceValue)) {
      return !resourceValue.includes(conditionValue);
    }
    return resourceValue !== conditionValue;
  }

  /**
   * Valuta operatore $gt (greater than)
   * @param {*} conditionValue - Valore della condizione
   * @param {*} resourceValue - Valore della risorsa
   * @returns {boolean} True se resourceValue > conditionValue
   * @private
   */
  _evaluateGreaterThan(conditionValue, resourceValue) {
    return resourceValue > conditionValue;
  }

  /**
   * Valuta operatore $gte (greater than or equal)
   * @param {*} conditionValue - Valore della condizione
   * @param {*} resourceValue - Valore della risorsa
   * @returns {boolean} True se resourceValue >= conditionValue
   * @private
   */
  _evaluateGreaterThanOrEqual(conditionValue, resourceValue) {
    return resourceValue >= conditionValue;
  }

  /**
   * Valuta operatore $lt (less than)
   * @param {*} conditionValue - Valore della condizione
   * @param {*} resourceValue - Valore della risorsa
   * @returns {boolean} True se resourceValue < conditionValue
   * @private
   */
  _evaluateLessThan(conditionValue, resourceValue) {
    return resourceValue < conditionValue;
  }

  /**
   * Valuta operatore $lte (less than or equal)
   * @param {*} conditionValue - Valore della condizione
   * @param {*} resourceValue - Valore della risorsa
   * @returns {boolean} True se resourceValue <= conditionValue
   * @private
   */
  _evaluateLessThanOrEqual(conditionValue, resourceValue) {
    return resourceValue <= conditionValue;
  }

  /**
   * Valuta operatore $in (in array)
   * @param {Array} conditionValue - Array di valori della condizione
   * @param {*} resourceValue - Valore della risorsa
   * @returns {boolean} True se resourceValue è presente in conditionValue
   * @private
   */
  _evaluateIn(conditionValue, resourceValue) {
    if (!Array.isArray(conditionValue)) {
      logger.warn('Valore non valido per operatore $in: deve essere un array');
      return false;
    }
    
    if (Array.isArray(resourceValue)) {
      // Se resourceValue è un array, verifica se c'è almeno un elemento in comune
      return resourceValue.some(item => conditionValue.includes(item));
    }
    
    return conditionValue.includes(resourceValue);
  }

  /**
   * Valuta operatore $nin (not in array)
   * @param {Array} conditionValue - Array di valori della condizione
   * @param {*} resourceValue - Valore della risorsa
   * @returns {boolean} True se resourceValue non è presente in conditionValue
   * @private
   */
  _evaluateNotIn(conditionValue, resourceValue) {
    if (!Array.isArray(conditionValue)) {
      logger.warn('Valore non valido per operatore $nin: deve essere un array');
      return false;
    }
    
    if (Array.isArray(resourceValue)) {
      // Se resourceValue è un array, verifica se non c'è alcun elemento in comune
      return !resourceValue.some(item => conditionValue.includes(item));
    }
    
    return !conditionValue.includes(resourceValue);
  }

  /**
   * Valuta operatore $all (contains all)
   * @param {Array} conditionValue - Array di valori della condizione
   * @param {Array} resourceValue - Valore della risorsa
   * @returns {boolean} True se resourceValue contiene tutti gli elementi di conditionValue
   * @private
   */
  _evaluateAll(conditionValue, resourceValue) {
    if (!Array.isArray(conditionValue) || !Array.isArray(resourceValue)) {
      return false;
    }
    
    return conditionValue.every(item => resourceValue.includes(item));
  }

  /**
   * Valuta operatore $size (array size)
   * @param {number} conditionValue - Dimensione attesa dell'array
   * @param {Array} resourceValue - Valore della risorsa
   * @returns {boolean} True se resourceValue ha lunghezza conditionValue
   * @private
   */
  _evaluateSize(conditionValue, resourceValue) {
    if (!Array.isArray(resourceValue)) {
      return false;
    }
    
    return resourceValue.length === conditionValue;
  }

  /**
   * Valuta operatore $regex (regular expression)
   * @param {string|RegExp} conditionValue - Espressione regolare
   * @param {string} resourceValue - Valore della risorsa
   * @returns {boolean} True se resourceValue corrisponde all'espressione regolare
   * @private
   */
  _evaluateRegex(conditionValue, resourceValue) {
    if (typeof resourceValue !== 'string') {
      return false;
    }
    
    let regex;
    if (conditionValue instanceof RegExp) {
      regex = conditionValue;
    } else if (typeof conditionValue === 'string') {
      try {
        // Estrai i flag se sono forniti in formato Mongo (/pattern/flags)
        const regexMatch = conditionValue.match(/^\/(.*?)\/([gimuy]*)$/);
        if (regexMatch) {
          regex = new RegExp(regexMatch[1], regexMatch[2]);
        } else {
          regex = new RegExp(conditionValue);
        }
      } catch (error) {
        logger.error({ err: error }, 'Errore nella creazione dell\'espressione regolare');
        return false;
      }
    } else {
      return false;
    }
    
    return regex.test(resourceValue);
  }

  /**
   * Valuta operatore $exists (field exists)
   * @param {boolean} conditionValue - Se il campo deve esistere
   * @param {*} resourceValue - Valore della risorsa
   * @returns {boolean} True se il campo esiste secondo la condizione
   * @private
   */
  _evaluateExists(conditionValue, resourceValue) {
    const exists = resourceValue !== undefined && resourceValue !== null;
    return conditionValue ? exists : !exists;
  }

  /**
   * Valuta operatore $elemMatch (array element match)
   * @param {Object} conditionValue - Condizione da applicare agli elementi dell'array
   * @param {Array} resourceValue - Valore della risorsa
   * @returns {boolean} True se almeno un elemento dell'array corrisponde
   * @private
   */
  _evaluateElemMatch(conditionValue, resourceValue) {
    if (!Array.isArray(resourceValue)) {
      return false;
    }
    
    return resourceValue.some(item => this.evaluateConditions(conditionValue, item));
  }

  /**
   * Converte condizioni MongoDB-like in condizioni Sequelize
   * @param {Object} conditions - Condizioni MongoDB-like
   * @returns {Object} Condizioni Sequelize equivalenti
   */
  convertToSequelizeConditions(conditions) {
    // Questa funzione sarà implementata nella fase 3
    // per ottimizzare le query al database
    return conditions;
  }
}

module.exports = new PermissionEvaluator();