'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/sequelize-cli.js')[env];
const setupTenantHooks = require('../config/sequelize-hooks');
const { createLogger } = require('../utils/logger');
const logger = createLogger('models:index');

// Modelli da file singoli
const importModels = [
  // === CORE SYSTEM MODELS ===
  'tenant',
  'user',
  'user-profile',  // Profile separato per Real Estate
  'role',        
  'ability',     
  'user-role',
  'user-ability',
  
  // === REAL ESTATE MODELS ===
  'saved-search',
  'search-execution',  // NUOVO: Tracciamento esecuzioni
  'search-result'      // MODIFICATO: Solo metadata + AI analysis
];

// Modelli raggruppati
const lookupModelsFile = 'lookup-models.js';
const historyModelsFile = 'history-models.js';

const db = {};

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

// Configura hooks per multi-tenancy
setupTenantHooks(sequelize);

logger.info('Loading models...');

// Importa modelli da file singoli
importModels.forEach(modelName => {
  const modelPath = path.join(__dirname, `${modelName}.js`);
  
  if (fs.existsSync(modelPath)) {
    try {
      const model = require(modelPath)(sequelize, Sequelize.DataTypes);
      db[model.name] = model;
      logger.debug(`Model loaded: ${model.name}`);
    } catch (error) {
      logger.error({ err: error, modelName }, `Failed to load model: ${modelName}`);
      throw error;
    }
  } else {
    logger.warn(`Model file not found: ${modelPath}`);
  }
});

// Importa modelli raggruppati da lookup-models.js
if (fs.existsSync(path.join(__dirname, lookupModelsFile))) {
  try {
    const lookupModels = require(path.join(__dirname, lookupModelsFile))(sequelize, Sequelize.DataTypes);
    Object.keys(lookupModels).forEach(modelName => {
      db[modelName] = lookupModels[modelName];
      logger.debug(`Lookup model loaded: ${modelName}`);
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to load lookup models');
    throw error;
  }
}

// Importa modelli raggruppati da history-models.js
/* if (fs.existsSync(path.join(__dirname, historyModelsFile))) {
  try {
    const historyModels = require(path.join(__dirname, historyModelsFile))(sequelize, Sequelize.DataTypes);
    Object.keys(historyModels).forEach(modelName => {
      db[modelName] = historyModels[modelName];
      logger.debug(`History model loaded: ${modelName}`);
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to load history models');
    throw error;
  }
} */

logger.info(`Total models loaded: ${Object.keys(db).length}`);

// Configura le associazioni tra i modelli
logger.info('Setting up model associations...');
let associationCount = 0;

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    try {
      db[modelName].associate(db);
      associationCount++;
      logger.debug(`Associations set for: ${modelName}`);
    } catch (error) {
      logger.error({ err: error, modelName }, `Failed to set associations for: ${modelName}`);
      throw error;
    }
  }
});

logger.info(`Model associations completed: ${associationCount} models with associations`);

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Log summary di tutti i modelli caricati
const modelNames = Object.keys(db).filter(key => key !== 'sequelize' && key !== 'Sequelize');
logger.info(`Models loaded successfully: [${modelNames.join(', ')}]`);

module.exports = db;