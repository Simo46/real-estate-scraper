'use strict';

/**
 * Index file per l'API
 * Questo file esporta i controller, i route e i validatori
 */

// Controllers
const authController = require('./controllers/authController');
const userController = require('./controllers/userController');
const roleController = require('./controllers/roleController');
const filialeController = require('./controllers/filialeController');
const pianoController = require('./controllers/pianoController'); 
const localeController = require('./controllers/localeController');
const assetController = require('./controllers/assetController');
const attrezzaturaController = require('./controllers/attrezzaturaController');
const strumentoController = require('./controllers/strumentoController');
const impiantoController = require('./controllers/impiantoController');
const userAbilityController = require('./controllers/userAbilityController');

// Routes
const routes = require('./routes');

// Validators
const authValidators = require('./validators/authValidators');
const userValidators = require('./validators/userValidators');
const roleValidators = require('./validators/roleValidators');
const filialeValidators = require('./validators/filialeValidators');
const pianoValidators = require('./validators/pianoValidators'); 
const localeValidators = require('./validators/localeValidators'); 
const assetValidators = require('./validators/assetValidators');
const attrezzaturaValidators = require('./validators/attrezzaturaValidators');
const strumentoValidators = require('./validators/strumentoValidators');
const impiantoValidators = require('./validators/impiantoValidators');
const userAbilityValidators = require('./validators/userAbilityValidators');

module.exports = {
  controllers: {
    authController,
    userController,
    roleController,
    filialeController,
    pianoController,
    localeController,
    assetController,
    attrezzaturaController,
    strumentoController,
    impiantoController,
    userAbilityController
  },
  routes,
  validators: {
    authValidators,
    userValidators,
    roleValidators,
    filialeValidators,
    pianoValidators,
    localeValidators,
    assetValidators,
    attrezzaturaValidators,
    strumentoValidators,
    impiantoValidators,
    userAbilityValidators
  }
};