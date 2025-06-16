'use strict';

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const userValidators = require('../validators/userValidators');
const authValidators = require('../validators/authValidators');
const { authenticate } = require('../../middleware/authMiddleware');
const policyMiddlewareFactory = require('../../middleware/policyMiddlewareFactory');
const userAbilityRoutes = require('./userAbilityRoutes');

/**
 * @route GET /api/users/roles/all
 * @desc Ottiene i ruoli disponibili
 * @access Private - In base ai permessi dell'utente
 */
router.get('/roles/all',
  authenticate,
  policyMiddlewareFactory.create('Role', 'read'),
  userController.getRoles
);

/**
 * @route GET /api/users
 * @desc Ottiene la lista degli utenti con supporto per filtri e paginazione
 * @access Private - In base ai permessi dell'utente
 */
router.get('/',
  authenticate,
  policyMiddlewareFactory.createList('User', { applyFilters: true }),
  userController.getUsers
);

/**
 * @route GET /api/users/:id
 * @desc Ottiene un utente specifico per ID
 * @access Private - In base ai permessi dell'utente
 */
router.get('/:id',
  authenticate,
  policyMiddlewareFactory.create('User', 'read'),
  userController.getUserById
);

/**
 * @route POST /api/users
 * @desc Crea un nuovo utente
 * @access Private - In base ai permessi dell'utente
 */
router.post('/',
  authenticate,
  userValidators.createUser,
  policyMiddlewareFactory.create('User', 'create'),
  userController.createUser
);

/**
 * @route PUT /api/users/:id
 * @desc Aggiorna un utente esistente
 * @access Private - In base ai permessi dell'utente
 */
router.put('/:id',
  authenticate,
  userValidators.updateUser,
  policyMiddlewareFactory.create('User', 'update'),
  userController.updateUser
);

/**
 * @route DELETE /api/users/:id
 * @desc Elimina un utente
 * @access Private - In base ai permessi dell'utente
 */
router.delete('/:id',
  authenticate,
  policyMiddlewareFactory.create('User', 'delete'),
  userController.deleteUser
);

/**
 * @route POST /api/users/:id/roles
 * @desc Assegna ruoli a un utente
 * @access Private - In base ai permessi dell'utente
 */
router.post('/:id/roles',
  authenticate,
  userValidators.assignRoles,
  policyMiddlewareFactory.create('User', 'update'),
  userController.assignRoles
);

/**
 * @route PUT /api/users/me/auth-settings
 * @desc Aggiorna impostazioni di autenticazione dell'utente corrente
 * @access Private
 */
router.put('/me/auth-settings',
  authenticate,
  authValidators.updateAuthSettings,
  userController.updateAuthSettings
);

/**
 * @route GET /api/users/me/role-stats
 * @desc Ottiene statistiche utilizzo ruoli per l'utente corrente
 * @access Private
 */
router.get('/me/role-stats',
  authenticate,
  userController.getRoleUsageStats
);

// Usa le routes degli userAbility come nested routes
router.use('/:userId/abilities', userAbilityRoutes);

module.exports = router;