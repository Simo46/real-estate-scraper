'use strict';

const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const roleValidators = require('../validators/roleValidators');
const { authenticate } = require('../../middleware/authMiddleware');
const policyMiddlewareFactory = require('../../middleware/policyMiddlewareFactory');

/**
 * @route GET /api/roles
 * @desc Ottiene la lista dei ruoli con supporto per filtri e paginazione
 * @access Private - In base ai permessi dell'utente
 */
router.get('/',
  authenticate,
  policyMiddlewareFactory.createList('Role', { applyFilters: true }),
  roleController.getRoles
);

/**
 * @route GET /api/roles/:id
 * @desc Ottiene un ruolo specifico per ID
 * @access Private - In base ai permessi dell'utente
 */
router.get('/:id',
  authenticate,
  policyMiddlewareFactory.create('Role', 'read'),
  roleController.getRoleById
);

/**
 * @route POST /api/roles
 * @desc Crea un nuovo ruolo
 * @access Private - In base ai permessi dell'utente
 */
router.post('/',
  authenticate,
  roleValidators.createRole,
  policyMiddlewareFactory.create('Role', 'create'),
  roleController.createRole
);

/**
 * @route PUT /api/roles/:id
 * @desc Aggiorna un ruolo esistente
 * @access Private - In base ai permessi dell'utente
 */
router.put('/:id',
  authenticate,
  roleValidators.updateRole,
  policyMiddlewareFactory.create('Role', 'update'),
  roleController.updateRole
);

/**
 * @route DELETE /api/roles/:id
 * @desc Elimina un ruolo
 * @access Private - In base ai permessi dell'utente
 */
router.delete('/:id',
  authenticate,
  policyMiddlewareFactory.create('Role', 'delete'),
  roleController.deleteRole
);

/**
 * @route POST /api/roles/:id/abilities
 * @desc Assegna abilities a un ruolo
 * @access Private - In base ai permessi dell'utente
 */
router.post('/:id/abilities',
  authenticate,
  roleValidators.assignAbilities,
  policyMiddlewareFactory.create('Role', 'update'),
  roleController.assignAbilities
);

/**
 * @route DELETE /api/roles/:id/abilities
 * @desc Rimuove abilities da un ruolo
 * @access Private - In base ai permessi dell'utente
 */
router.delete('/:id/abilities',
  authenticate,
  policyMiddlewareFactory.create('Role', 'update'),
  roleController.removeAbilities
);

/**
 * @route PUT /api/roles/:id/abilities
 * @desc Sostituisce completamente le abilities di un ruolo
 * @access Private - In base ai permessi dell'utente
 */
router.put('/:id/abilities',
  authenticate,
  roleValidators.assignAbilities,
  policyMiddlewareFactory.create('Role', 'update'),
  roleController.replaceAbilities
);

module.exports = router;