'use strict';

/**
 * Index file per l'API
 * Questo file esporta i controller, i route e i validatori
 */

// Controllers
const authController = require('./controllers/authController');
const userController = require('./controllers/userController');
const roleController = require('./controllers/roleController');
const userAbilityController = require('./controllers/userAbilityController');

// Routes
const routes = require('./routes');

// Validators
const authValidators = require('./validators/authValidators');
const userValidators = require('./validators/userValidators');
const roleValidators = require('./validators/roleValidators');
const userAbilityValidators = require('./validators/userAbilityValidators');

module.exports = {
  controllers: {
    authController,
    userController,
    roleController,
    userAbilityController
  },
  routes,
  validators: {
    authValidators,
    userValidators,
    roleValidators,
    userAbilityValidators
  }
};