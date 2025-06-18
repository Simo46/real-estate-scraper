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
  'tenant',
  'user',
  'role',        
  'ability',     
  'user-role',
  'user-ability', 
  'filiale',
  'edificio',
  'piano',
  'locale',
  'asset',
  'attrezzatura',
  'strumento-di-misura',
  'impianto-tecnologico',
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

// Importa modelli da file singoli
importModels.forEach(modelName => {
  if (fs.existsSync(path.join(__dirname, `${modelName}.js`))) {
    const model = require(path.join(__dirname, `${modelName}.js`))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  }
});

// Importa modelli raggruppati da lookup-models.js
if (fs.existsSync(path.join(__dirname, lookupModelsFile))) {
  const lookupModels = require(path.join(__dirname, lookupModelsFile))(sequelize, Sequelize.DataTypes);
  Object.keys(lookupModels).forEach(modelName => {
    db[modelName] = lookupModels[modelName];
  });
}

// Importa modelli raggruppati da history-models.js
if (fs.existsSync(path.join(__dirname, historyModelsFile))) {
  const historyModels = require(path.join(__dirname, historyModelsFile))(sequelize, Sequelize.DataTypes);
  Object.keys(historyModels).forEach(modelName => {
    db[modelName] = historyModels[modelName];
  });
}

// Configura le associazioni tra i modelli
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

logger.info('Models loaded successfully');

module.exports = db;