// src/utils/mongoToSequelize.js
'use strict';

const { Op } = require('sequelize');
const { createLogger } = require('./logger');
const logger = createLogger('utils:mongoToSequelize');

/**
 * Converte condizioni in formato MongoDB in condizioni Sequelize
 * @param {Object} conditions - Condizioni in formato MongoDB
 * @returns {Object} - Condizioni in formato Sequelize
 */
function mongoToSequelize(conditions) {
  if (!conditions || typeof conditions !== 'object') {
    return conditions;
  }

  // Funzione ricorsiva per attraversare l'oggetto condizioni
  function convertObject(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    // Se è un array, applica la conversione a ogni elemento
    if (Array.isArray(obj)) {
      return obj.map(item => convertObject(item));
    }

    // Nuovo oggetto per le condizioni convertite
    const result = {};

    // Per ogni chiave nell'oggetto
    for (const key in obj) {
      // Se la chiave è un operatore MongoDB ($eq, $gt, ecc.)
      if (key.startsWith('$')) {
        // Tenta di convertire in operatore Sequelize specifico
        const convertedCondition = convertSpecificOperator(key, obj[key]);
        
        // Merge nel risultato
        Object.assign(result, convertedCondition);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        // Se il valore è un oggetto, potrebbe contenere operatori
        const nestedValue = obj[key];
        
        // Se l'oggetto contiene operatori MongoDB
        if (Object.keys(nestedValue).some(k => k.startsWith('$'))) {
          // Convertitore migliorato per operatori nidificati
          result[key] = convertNestedOperators(nestedValue);
        } else {
          // Altrimenti, converti normalmente
          result[key] = convertObject(nestedValue);
        }
      } else {
        // Se non è un operatore né un oggetto, mantienilo invariato
        result[key] = obj[key];
      }
    }
    
    return result;
  }

  /**
   * Converte un operatore specifico MongoDB in un operatore Sequelize
   * @param {string} mongoOp - Operatore MongoDB
   * @param {*} value - Valore associato all'operatore
   * @returns {Object} - Equivalente in Sequelize
   */
  function convertSpecificOperator(mongoOp, value) {
    // Prepara il valore convertito
    let convertedValue = value;
    
    // Se il valore è un oggetto, potrebbe avere bisogno di conversione ricorsiva
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      convertedValue = convertObject(value);
    } else if (Array.isArray(value)) {
      // Se è un array, converti ogni elemento
      convertedValue = value.map(item => {
        if (typeof item === 'object' && item !== null) {
          return convertObject(item);
        }
        return item;
      });
    }
    
    switch(mongoOp) {
      case '$eq':
        return { [Op.eq]: convertedValue };
        
      case '$ne':
        return { [Op.ne]: convertedValue };
        
      case '$gt':
        return { [Op.gt]: convertedValue };
        
      case '$gte':
        return { [Op.gte]: convertedValue };
        
      case '$lt':
        return { [Op.lt]: convertedValue };
        
      case '$lte':
        return { [Op.lte]: convertedValue };
        
      case '$in':
        return { [Op.in]: Array.isArray(convertedValue) ? convertedValue : [convertedValue] };
        
      case '$nin':
        return { [Op.notIn]: Array.isArray(convertedValue) ? convertedValue : [convertedValue] };
        
      case '$all':
        // Implementazione migliorata per $all usando AND e IN
        if (!Array.isArray(convertedValue)) {
          return { [Op.in]: [convertedValue] };
        }
        
        if (convertedValue.length === 1) {
          return { [Op.in]: [convertedValue[0]] };
        }
        
        // Per array con più valori, creiamo una condizione AND di IN
        return {
          [Op.and]: convertedValue.map(item => ({ [Op.in]: [item] }))
        };
        
      case '$regex':
        // Gestione migliorata delle regex
        if (convertedValue instanceof RegExp) {
          return { [Op.regexp]: convertedValue };
        }
        
        if (typeof convertedValue === 'string') {
          // Supporto per sintassi MongoDB /pattern/flags
          const regexMatch = convertedValue.match(/^\/(.*?)\/([gimuy]*)$/);
          if (regexMatch) {
            try {
              return { [Op.regexp]: new RegExp(regexMatch[1], regexMatch[2]) };
            } catch (error) {
              logger.error({ err: error }, 'Errore nella creazione dell\'espressione regolare');
              return { [Op.like]: `%${convertedValue}%` };
            }
          }
          
          // Se non è in formato /pattern/flags, prova a creare una regex o fallback a LIKE
          try {
            return { [Op.regexp]: new RegExp(convertedValue) };
          } catch (error) {
            logger.warn({ err: error }, 'Fallback a LIKE per regex non valida');
            return { [Op.like]: `%${convertedValue}%` };
          }
        }
        
        // Fallback a LIKE se la regex non è valida
        return { [Op.like]: `%${convertedValue}%` };
        
      case '$like':
        return { [Op.like]: convertedValue };
        
      case '$iLike':
        return { [Op.iLike]: convertedValue };
        
      case '$notLike':
        return { [Op.notLike]: convertedValue };
        
      case '$notILike':
        return { [Op.notILike]: convertedValue };
      
      case '$between':
        if (Array.isArray(convertedValue) && convertedValue.length === 2) {
          return { [Op.between]: convertedValue };
        }
        logger.warn('Valore non valido per $between: deve essere un array di 2 elementi');
        return {}; // Restituire un oggetto vuoto per evitare errori
      
      case '$notBetween':
        if (Array.isArray(convertedValue) && convertedValue.length === 2) {
          return { [Op.notBetween]: convertedValue };
        }
        logger.warn('Valore non valido per $notBetween: deve essere un array di 2 elementi');
        return {}; // Restituire un oggetto vuoto per evitare errori
      
      case '$or':
        if (Array.isArray(convertedValue)) {
          return { [Op.or]: convertedValue };
        }
        logger.warn('Valore non valido per $or: deve essere un array');
        return {}; // Restituire un oggetto vuoto per evitare errori
      
      case '$and':
        if (Array.isArray(convertedValue)) {
          return { [Op.and]: convertedValue };
        }
        logger.warn('Valore non valido per $and: deve essere un array');
        return {}; // Restituire un oggetto vuoto per evitare errori
      
      case '$not':
        // Gestione migliorata di $not
        if (typeof convertedValue === 'object' && !Array.isArray(convertedValue)) {
          // Converti gli operatori interni
          const innerCondition = convertObject(convertedValue);
          return { [Op.not]: innerCondition };
        }
        return { [Op.not]: convertedValue };
      
      case '$exists':
        // Implementazione di $exists
        if (convertedValue === true) {
          return { [Op.not]: null };
        } else {
          return { [Op.is]: null };
        }
      
      case '$containsAll':
        // Operatore personalizzato per array che contiene tutti gli elementi
        if (Array.isArray(convertedValue)) {
          // In Sequelize, possiamo usare la funzione postgres 'array_contains'
          return { [Op.contained]: convertedValue };
        }
        return { [Op.contains]: [convertedValue] };
      
      case '$containsAny':
        // Operatore personalizzato per array che contiene almeno un elemento
        if (Array.isArray(convertedValue)) {
          return { [Op.overlap]: convertedValue };
        }
        return { [Op.contains]: [convertedValue] };
      
      case '$startsWith':
        if (typeof convertedValue === 'string') {
          return { [Op.startsWith]: convertedValue };
        }
        return { [Op.like]: `${convertedValue}%` };
      
      case '$endsWith':
        if (typeof convertedValue === 'string') {
          return { [Op.endsWith]: convertedValue };
        }
        return { [Op.like]: `%${convertedValue}` };
      
      case '$substring':
        if (typeof convertedValue === 'string') {
          return { [Op.substring]: convertedValue };
        }
        return { [Op.like]: `%${convertedValue}%` };
      
      default:
        logger.warn(`Operatore MongoDB non supportato: ${mongoOp}`);
        // Mantenere la chiave originale per non perdere la condizione
        return { [mongoOp]: convertedValue };
    }
  }

  /**
   * Converte operatori nidificati in un campo
   * @param {Object} nestedOperators - Oggetto con operatori nidificati
   * @returns {Object} - Condizioni Sequelize equivalenti
   */
  function convertNestedOperators(nestedOperators) {
    const sequelizeConditions = {};
    
    for (const op in nestedOperators) {
      if (op.startsWith('$')) {
        // Converti l'operatore specifico
        const converted = convertSpecificOperator(op, nestedOperators[op]);
        
        // Combina nel risultato
        Object.assign(sequelizeConditions, converted);
      } else {
        // Chiave non-operatore, mantieni come attributo normale
        sequelizeConditions[op] = convertObject(nestedOperators[op]);
      }
    }
    
    return sequelizeConditions;
  }

  return convertObject(conditions);
}

/**
 * Converte un operatore MongoDB in un operatore Sequelize
 * @param {string} mongoOp - Operatore MongoDB
 * @returns {Symbol|null} - Operatore Sequelize corrispondente
 */
function mongoOperatorToSequelize(mongoOp) {
  const operatorMap = {
    '$eq': Op.eq,
    '$ne': Op.ne,
    '$gt': Op.gt,
    '$gte': Op.gte,
    '$lt': Op.lt,
    '$lte': Op.lte,
    '$in': Op.in,
    '$nin': Op.notIn,
    '$like': Op.like,
    '$iLike': Op.iLike,
    '$notLike': Op.notLike, 
    '$notILike': Op.notILike,
    '$regexp': Op.regexp,
    '$notRegexp': Op.notRegexp,
    '$and': Op.and,
    '$or': Op.or,
    '$not': Op.not,
    '$between': Op.between,
    '$notBetween': Op.notBetween,
    '$overlap': Op.overlap,
    '$contains': Op.contains,
    '$contained': Op.contained,
    '$startsWith': Op.startsWith,
    '$endsWith': Op.endsWith,
    '$substring': Op.substring
  };
  
  return operatorMap[mongoOp] || null;
}

module.exports = mongoToSequelize;