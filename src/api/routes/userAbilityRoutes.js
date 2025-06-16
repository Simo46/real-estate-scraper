'use strict';

const express = require('express');
const router = express.Router({ mergeParams: true });
const userAbilityController = require('../controllers/userAbilityController');
const userAbilityValidators = require('../validators/userAbilityValidators');
const { authenticate } = require('../../middleware/authMiddleware');
const policyMiddlewareFactory = require('../../middleware/policyMiddlewareFactory');

/**
 * @route GET /api/users/:userId/abilities
 * @desc Ottiene tutti i permessi individuali di un utente
 * @access Private - In base ai permessi dell'utente
 */
router.get('/',
  authenticate,
  policyMiddlewareFactory.createList('UserAbility', { 
    applyFilters: true,
    additionalConditions: (req) => ({
      user_id: req.params.userId
    })
  }),
  userAbilityController.getUserAbilities
);

/**
 * @route GET /api/users/:userId/abilities/:abilityId
 * @desc Ottiene un permesso individuale specifico
 * @access Private - In base ai permessi dell'utente
 */
router.get('/:abilityId',
  authenticate,
  policyMiddlewareFactory.create('UserAbility', 'read', {
    findOptions: {
      where: (req) => ({
        id: req.params.abilityId,
        user_id: req.params.userId
      })
    }
  }),
  userAbilityController.getUserAbilityById
);

/**
 * NUOVO: @route GET /api/users/:userId/abilities/by-role-context
 * @desc Ottiene i permessi individuali raggruppati per contesto ruolo
 * @access Private - In base ai permessi dell'utente
 */
router.get('/by-role-context',
  authenticate,
  policyMiddlewareFactory.create('UserAbility', 'read', {
    findOptions: {
      where: (req) => ({
        user_id: req.params.userId
      })
    }
  }),
  userAbilityController.getUserAbilitiesByRoleContext
);

/**
 * @route POST /api/users/:userId/abilities
 * @desc Crea un nuovo permesso individuale
 * @access Private - In base ai permessi dell'utente
 */
router.post('/',
  authenticate,
  userAbilityValidators.createUserAbility,
  policyMiddlewareFactory.create('UserAbility', 'create'),
  userAbilityController.createUserAbility
);

/**
 * @route PUT /api/users/:userId/abilities/:abilityId
 * @desc Aggiorna un permesso individuale esistente
 * @access Private - In base ai permessi dell'utente
 */
router.put('/:abilityId',
  authenticate,
  userAbilityValidators.updateUserAbility,
  policyMiddlewareFactory.create('UserAbility', 'update'),
  userAbilityController.updateUserAbility
);

/**
 * @route DELETE /api/users/:userId/abilities/:abilityId
 * @desc Elimina un permesso individuale
 * @access Private - In base ai permessi dell'utente
 */
router.delete('/:abilityId',
  authenticate,
  policyMiddlewareFactory.create('UserAbility', 'delete'),
  userAbilityController.deleteUserAbility
);

/**
 * @route GET /api/users/:userId/effective-abilities
 * @desc Ottiene un riassunto combinato di tutti i permessi dell'utente
 * @access Private - In base ai permessi dell'utente
 */
router.get('/effective-abilities',
  authenticate,
  policyMiddlewareFactory.create('User', 'read', {
    findOptions: {
      where: (req) => ({
        id: req.params.userId
      })
    }
  }),
  userAbilityController.getUserEffectiveAbilities
);

module.exports = router;