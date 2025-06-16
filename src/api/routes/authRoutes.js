'use strict';

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authValidators = require('../validators/authValidators');
const { authenticate } = require('../../middleware/authMiddleware');
const policyMiddlewareFactory = require('../../middleware/policyMiddlewareFactory');
const { 
  loginRateLimit, 
  confirmRoleRateLimit, 
  roleSwitchRateLimit, 
  generalAuthRateLimit 
} = require('../../middleware/authRateLimiterMiddleware');

// Applica rate limiting generale a tutte le rotte di autenticazione
router.use(generalAuthRateLimit());

/**
 * @route POST /api/auth/register
 * @desc Registrazione di un nuovo utente (richiede autenticazione e permessi)
 * @access Private - Solo in base ai permessi dell'utente
 */
router.post('/register', 
    authenticate, 
    authValidators.register,
    policyMiddlewareFactory.create('User', 'create'),
    authController.register
);

/**
 * @route POST /api/auth/login
 * @desc Login utente con gestione multi-ruolo automatica
 * @access Public
 * @rateLimit 5 tentativi per IP ogni 15 minuti
 */
router.post('/login', 
    loginRateLimit(),
    authValidators.login, 
    authController.login
);

/**
 * @route POST /api/auth/login-with-role
 * @desc Login diretto con ruolo specificato (scorciatoia multi-ruolo)
 * @access Public
 * @rateLimit 5 tentativi per IP ogni 15 minuti (condiviso con /login)
 */
router.post('/login-with-role',
    loginRateLimit(),
    authValidators.loginWithRole,
    authController.loginWithRole
);

/**
 * @route POST /api/auth/confirm-role
 * @desc Conferma ruolo dopo selezione multi-ruolo
 * @access Public (ma richiede preAuthToken valido)
 * @rateLimit 10 tentativi per preAuthToken
 */
router.post('/confirm-role',
    confirmRoleRateLimit(),
    authValidators.confirmRole,
    authController.confirmRole
);

/**
 * @route POST /api/auth/switch-role
 * @desc Cambio ruolo durante sessione attiva
 * @access Private
 * @rateLimit 20 switch per utente ogni ora
 */
router.post('/switch-role',
    authenticate,
    roleSwitchRateLimit(),
    authValidators.switchRole,
    authController.switchRole
);

/**
 * @route GET /api/auth/available-roles
 * @desc Ottieni lista ruoli disponibili per utente autenticato
 * @access Private
 */
router.get('/available-roles',
    authenticate,
    authController.getAvailableRoles
);

/**
 * @route GET /api/auth/role-usage-stats
 * @desc Ottieni statistiche dettagliate utilizzo ruoli con raccomandazioni
 * @access Private
 */
router.get('/role-usage-stats',
    authenticate,
    authController.getRoleUsageStats
);

/**
 * NUOVO: @route GET /api/auth/ui-abilities
 * @desc Ottieni abilities semplificate per UI frontend con filtro ruolo attivo
 * @access Private
 */
router.get('/ui-abilities',
    authenticate,
    authController.getUIAbilities
);

/**
 * @route POST /api/auth/logout
 * @desc Logout utente
 * @access Private
 */
router.post('/logout', 
    authenticate, 
    authController.logout
);

/**
 * @route POST /api/auth/refresh
 * @desc Refresh token con mantenimento ruolo attivo
 * @access Public
 */
router.post('/refresh', 
    authValidators.refreshToken, 
    authController.refreshToken
);

/**
 * @route GET /api/auth/me
 * @desc Ottieni informazioni utente autenticato con ruolo attivo
 * @access Private
 */
router.get('/me', 
    authenticate, 
    authController.me
);

/**
 * @route PUT /api/auth/settings
 * @desc Aggiorna impostazioni di autenticazione utente (ruolo predefinito, auto-login)
 * @access Private
 */
router.put('/settings',
    authenticate,
    authValidators.updateAuthSettings,
    authController.updateAuthSettings
);

/**
 * @route GET /api/auth/rate-limit-stats
 * @desc Ottieni statistiche rate limiting (solo per amministratori)
 * @access Private - Solo amministratori
 */
router.get('/rate-limit-stats',
    authenticate,
    policyMiddlewareFactory.create('System', 'read'),
    authController.getRateLimitStats
);

/**
 * @route POST /api/auth/reset-rate-limit
 * @desc Reset rate limiting per IP o utente (solo per amministratori)
 * @access Private - Solo amministratori
 */
router.post('/reset-rate-limit',
    authenticate,
    policyMiddlewareFactory.create('System', 'manage'),
    authValidators.resetRateLimit,
    authController.resetRateLimit
);

module.exports = router;