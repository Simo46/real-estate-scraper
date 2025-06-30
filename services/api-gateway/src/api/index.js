'use strict';

/**
 * Index file per l'API
 * Questo file esporta i controller, i route e i validatori
 * Aggiornato con i nuovi moduli Real Estate
 */

// ===== CONTROLLERS =====

// Controllers esistenti
console.log('Loading authController...');
const authController = require('./controllers/authController');
console.log('Loading userController...');
const userController = require('./controllers/userController');
console.log('Loading roleController...');
const roleController = require('./controllers/roleController');
console.log('Loading userAbilityController...');
const userAbilityController = require('./controllers/userAbilityController');

// Controllers Real Estate (Task 1.5)
console.log('Loading searchResultController...');
const searchResultController = require('./controllers/searchResultController');
console.log('Loading savedSearchController...');
const savedSearchController = require('./controllers/savedSearchController');
console.log('Loading searchExecutionController...');
const searchExecutionController = require('./controllers/searchExecutionController');

// ===== ROUTES (Combined Router) =====

console.log('Loading combined routes...');
const routes = require('./routes'); // This now imports the combined router

// ===== VALIDATORS =====

// Validators esistenti
console.log('Loading authValidators...');
const authValidators = require('./validators/authValidators');
console.log('Loading userValidators...');
const userValidators = require('./validators/userValidators');
console.log('Loading roleValidators...');
const roleValidators = require('./validators/roleValidators');
console.log('Loading userAbilityValidators...');
const userAbilityValidators = require('./validators/userAbilityValidators');

// Validators Real Estate (Task 1.5)
console.log('Loading searchResultValidators...');
const searchResultValidators = require('./validators/searchResultValidators');
console.log('Loading savedSearchValidators...');
const savedSearchValidators = require('./validators/savedSearchValidators');
console.log('Loading searchExecutionValidators...');
const searchExecutionValidators = require('./validators/searchExecutionValidators');

console.log('All modules loaded successfully!');

// ===== EXPORT CENTRALIZZATO =====

module.exports = {
  // Controllers
  controllers: {
    // Esistenti
    authController,
    userController,
    roleController,
    userAbilityController,
    
    // Real Estate (Task 1.5)
    searchResultController,
    savedSearchController,
    searchExecutionController
  },

  // Routes (now a single combined router)
  routes,

  // Validators
  validators: {
    // Esistenti
    authValidators,
    userValidators,
    roleValidators,
    userAbilityValidators,
    
    // Real Estate (Task 1.5)
    searchResultValidators,
    savedSearchValidators,
    searchExecutionValidators
  }
};