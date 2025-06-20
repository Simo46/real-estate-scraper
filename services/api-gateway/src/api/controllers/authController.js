'use strict';

const { Op } = require('sequelize');
const { User, Role, Ability, sequelize, UserAbility } = require('../../models');
const jwtService = require('../../services/jwtService');
const abilityService = require('../../services/abilityService');
const userSettingsService = require('../../services/userSettingsService');
const { AppError } = require('../../middleware/errorHandler');
const { createLogger } = require('../../utils/logger');
const { validationResult } = require('express-validator');
const logger = createLogger('controllers:auth');

/**
 * Controller per l'autenticazione con supporto multi-ruolo
 */
class AuthController {
  constructor() {
    // Bind di tutti i metodi pubblici per preservare il contesto this
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.loginWithRole = this.loginWithRole.bind(this);
    this.confirmRole = this.confirmRole.bind(this);
    this.switchRole = this.switchRole.bind(this);
    this.getAvailableRoles = this.getAvailableRoles.bind(this);
    this.logout = this.logout.bind(this);
    this.refreshToken = this.refreshToken.bind(this);
    this.me = this.me.bind(this);
    this.updateAuthSettings = this.updateAuthSettings.bind(this);
    this.getRateLimitStats = this.getRateLimitStats.bind(this);
    this.resetRateLimit = this.resetRateLimit.bind(this);
    this.getRoleUsageStats = this.getRoleUsageStats.bind(this);
    this.getUIAbilities = this.getUIAbilities.bind(this); // NUOVO
  }

  /**
   * Registra un nuovo utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async register(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      const { name, email, username, password } = req.body;

      // Verifica se l'utente esiste già
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [
            { email },
            { username }
          ]
        }
      });

      if (existingUser) {
        const field = existingUser.email === email ? 'email' : 'username';
        return next(AppError.conflict(`Utente con questo ${field} esiste già`));
      }

      // Inizia una transazione
      const transaction = await sequelize.transaction();

      try {
        // Crea il nuovo utente
        const user = await User.create({
          name,
          email,
          username,
          password, // Hash generato automaticamente tramite hook
          tenant_id: req.tenantId,
          active: true
        }, { 
          transaction,
          userId: req.user?.id // Per l'audit trail
        });

        // Assegna un ruolo base all'utente
        const baseRole = await Role.findOne({
          where: { name: 'Magazzino' }, // Ruolo con meno privilegi
          transaction
        });

        if (baseRole) {
          await user.addRole(baseRole, { transaction });
        } else {
          logger.warn('Ruolo base non trovato per il nuovo utente');
        }

        // Commit della transazione
        await transaction.commit();

        // Genera token - per registrazione, usa il primo ruolo disponibile
        const userWithRoles = await User.findByPk(user.id, {
          include: [{
            model: Role,
            as: 'roles',
            through: { attributes: [] },
            include: [{ 
              model: Ability,
              as: 'abilities'
            }]
          }]
        });

        const activeRoleId = userWithRoles.roles && userWithRoles.roles.length > 0 
          ? userWithRoles.roles[0].id 
          : null;

        const tokens = jwtService.generateTokens(userWithRoles, activeRoleId);

        // Aggiorna il remember_token nel database
        await user.update({ remember_token: tokens.refreshTokenId });

        logger.info(`Nuovo utente registrato: ${username}`);

        // Restituisci risposta
        res.status(201).json({
          status: 'success',
          message: 'Utente registrato con successo',
          data: {
            user: user.toJSON(),
            ...tokens
          }
        });
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la registrazione');
      next(error);
    }
  }

  /**
   * Login principale con gestione multi-ruolo
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async login(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      const { username, password } = req.body;

      logger.info(`Tentativo di login per: ${username} nel tenant ${req.tenantId}`);

      // Cerca l'utente nel database con i ruoli precaricati
      const user = await User.findOne({
        where: {
          [Op.or]: [
            { username },
            { email: username }
          ],
          tenant_id: req.tenantId,
          active: true
        },
        include: [{
          model: Role,
          as: 'roles',
          through: { attributes: [] },
          include: [{
            model: Ability,
            as: 'abilities'
          }]
        },
        {
          model: UserAbility,
          as: 'userAbilities'
        }]
      });

      // Verifica se l'utente esiste
      if (!user) {
        logger.warn(`Tentativo di login fallito: utente ${username} non trovato nel tenant ${req.tenantId}`);
        return next(AppError.authentication('Credenziali non valide'));
      }

      // Verifica la password
      const isValidPassword = await user.validPassword(password);
      if (!isValidPassword) {
        logger.warn(`Tentativo di login fallito: password non valida per ${username}`);
        return next(AppError.authentication('Credenziali non valide'));
      }

      // Verifica che l'utente abbia almeno un ruolo
      if (!user.roles || user.roles.length === 0) {
        logger.warn(`Login negato: utente ${username} non ha ruoli assegnati`);
        return next(AppError.authorization('Utente senza ruoli assegnati'));
      }

      // NUOVO: Gestione multi-ruolo
      return await this.handleMultiRoleLogin(user, req, res, next);

    } catch (error) {
      logger.error({ err: error }, 'Errore durante il login');
      next(error);
    }
  }

  /**
   * Login diretto con ruolo specificato (scorciatoia)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async loginWithRole(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      const { username, password, roleId } = req.body;

      logger.info(`Tentativo di login con ruolo specifico per: ${username}, ruolo: ${roleId}`);

      // Autentica l'utente (logica simile al login normale)
      const user = await this.authenticateUser(username, password, req.tenantId);
      
      // Verifica che il ruolo specificato sia valido per l'utente
      const isValidRole = user.roles.some(role => role.id === roleId && role.active !== false);
      if (!isValidRole) {
        logger.warn(`Login fallito: ruolo ${roleId} non valido per utente ${username}`);
        return next(AppError.authorization('Ruolo non disponibile per questo utente'));
      }

      // Login immediato con il ruolo specificato
      return await this.completeLoginWithRole(user, roleId, req, res, next);

    } catch (error) {
      logger.error({ err: error }, 'Errore durante il login con ruolo');
      next(error);
    }
  }

  /**
   * Conferma ruolo dopo selezione multi-ruolo
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async confirmRole(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      const { preAuthToken, roleId } = req.body;

      logger.info(`Conferma ruolo: ${roleId}`);

      // Verifica il token di pre-autenticazione
      let preAuthPayload;
      try {
        preAuthPayload = jwtService.verifyPreAuthToken(preAuthToken);
      } catch (error) {
        logger.warn('Token pre-auth non valido o scaduto');
        return next(AppError.authentication('Token non valido o scaduto'));
      }

      // Verifica che il ruolo sia tra quelli disponibili
      if (!preAuthPayload.available_role_ids.includes(roleId)) {
        logger.warn(`Ruolo ${roleId} non nella lista disponibile per utente ${preAuthPayload.sub}`);
        return next(AppError.authorization('Ruolo non disponibile'));
      }

      // Carica l'utente con i ruoli
      const user = await User.findByPk(preAuthPayload.sub, {
        include: [{
          model: Role,
          as: 'roles',
          through: { attributes: [] },
          include: [{
            model: Ability,
            as: 'abilities'
          }]
        },
        {
          model: UserAbility,
          as: 'userAbilities'
        }]
      });

      if (!user || !user.active) {
        logger.warn(`Utente ${preAuthPayload.sub} non trovato o non attivo durante conferma ruolo`);
        return next(AppError.authentication('Utente non valido'));
      }

      // Completa il login con il ruolo confermato
      return await this.completeLoginWithRole(user, roleId, req, res, next);

    } catch (error) {
      logger.error({ err: error }, 'Errore durante la conferma ruolo');
      next(error);
    }
  }

  /**
   * Cambio ruolo durante sessione attiva
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async switchRole(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      const { roleId } = req.body;
      const user = req.user; // Popolato dal middleware di autenticazione

      logger.info(`Switch ruolo per utente ${user.username}: ${roleId}`);

      // Verifica che il ruolo specificato sia valido per l'utente
      const isValidRole = user.roles.some(role => role.id === roleId && role.active !== false);
      if (!isValidRole) {
        logger.warn(`Switch ruolo fallito: ruolo ${roleId} non valido per utente ${user.username}`);
        return next(AppError.authorization('Ruolo non disponibile per questo utente'));
      }

      // Aggiorna le statistiche di utilizzo ruoli
      await this.updateRoleUsageStats(user, roleId);

      // Genera nuovi token con il nuovo ruolo
      return await this.completeLoginWithRole(user, roleId, req, res, next);

    } catch (error) {
      logger.error({ err: error }, 'Errore durante il cambio ruolo');
      next(error);
    }
  }

  /**
   * Ottiene la lista dei ruoli disponibili per l'utente corrente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getAvailableRoles(req, res, next) {
    try {
      const user = req.user; // Popolato dal middleware di autenticazione

      logger.debug(`Richiesta ruoli disponibili per utente ${user.username}`);

      // Ottieni i ruoli disponibili tramite abilityService
      const availableRoles = abilityService.getAvailableRoles(user);

      res.json({
        status: 'success',
        data: {
          current_role: availableRoles.find(role => role.is_current) || null,
          available_roles: availableRoles
        }
      });

    } catch (error) {
      logger.error({ err: error }, 'Errore durante il recupero dei ruoli disponibili');
      next(error);
    }
  }

  /**
   * NUOVO: Ottiene abilities semplificate per il frontend UI
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getUIAbilities(req, res, next) {
    try {
      const user = req.user; // Popolato dal middleware di autenticazione

      logger.debug(`Richiesta UI abilities per utente ${user.username} con ruolo attivo ${user.active_role_id || 'nessuno'}`);

      // Ottieni l'ability completa dal servizio esistente
      const ability = await abilityService.defineAbilityFor(user);

      // Converti in formato semplificato per il frontend
      const uiAbilities = this.convertAbilityToUIFormat(ability, user);

      res.json({
        status: 'success',
        data: {
          abilities: uiAbilities,
          user_context: {
            id: user.id,
            username: user.username,
            active_role: user.active_role_id ? {
              id: user.active_role_id,
              name: user.active_role_name
            } : null,
            tenant_id: user.tenant_id
          },
          generated_at: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error({ err: error }, 'Errore durante il recupero delle UI abilities');
      next(error);
    }
  }

  /**
   * Effettua il logout di un utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async logout(req, res, next) {
    try {
      // Ottieni l'ID utente dal token
      const userId = req.user.id;

      // Aggiorna il remember_token dell'utente
      await User.update(
        { remember_token: null },
        { where: { id: userId } }
      );

      logger.info(`Logout effettuato con successo: ${req.user.username}`);

      // Restituisci risposta
      res.json({
        status: 'success',
        message: 'Logout effettuato con successo'
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante il logout');
      next(error);
    }
  }

  /**
   * Rinnova il token di accesso usando un refresh token con supporto multi-ruolo
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async refreshToken(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      const { refreshToken } = req.body;

      // Verifica il refresh token
      let decoded;
      try {
        decoded = jwtService.verifyRefreshToken(refreshToken);
      } catch (error) {
        logger.warn('Refresh token non valido o scaduto');
        return next(AppError.authentication('Refresh token non valido o scaduto'));
      }

      // Ottieni l'utente dal payload
      const user = await User.findOne({
        where: {
          id: decoded.sub,
          tenant_id: req.tenantId,
          active: true,
          remember_token: decoded.jti
        },
        include: [{
          model: Role,
          as: 'roles',
          through: { attributes: [] },
          include: [{
            model: Ability,
            as: 'abilities'
          }]
        },
        {
          model: UserAbility,
          as: 'userAbilities'
        }]
      });

      // Verifica se l'utente esiste
      if (!user) {
        logger.warn(`Refresh token invalido: utente non trovato o token revocato`);
        return next(AppError.authentication('Refresh token non valido'));
      }

      // NUOVO: Mantieni il ruolo attivo dal refresh token
      const activeRoleId = decoded.active_role_id;

      // Se c'era un ruolo attivo, verifica che sia ancora valido
      if (activeRoleId) {
        const isValidRole = user.roles.some(role => role.id === activeRoleId && role.active !== false);
        if (!isValidRole) {
          logger.warn(`Refresh fallito: ruolo attivo ${activeRoleId} non più valido per utente ${user.username}`);
          return next(AppError.authentication('Ruolo non più valido, necessario nuovo login'));
        }
      }

      // Genera nuovi token mantenendo il ruolo attivo
      const tokens = jwtService.generateTokens(user, activeRoleId);

      // Aggiorna il remember_token nel database
      await user.update({ remember_token: tokens.refreshTokenId });

      logger.info(`Token rinnovato per l'utente: ${user.username} con ruolo ${activeRoleId || 'nessuno'}`);

      // Restituisci risposta
      res.json({
        status: 'success',
        message: 'Token rinnovato con successo',
        data: tokens
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante il refresh del token');
      next(error);
    }
  }

  /**
   * Verifica il token attuale e restituisce informazioni sull'utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async me(req, res, next) {
    try {
      // Ottieni informazioni complete sull'utente
      const user = await User.findByPk(req.user.id, {
        include: [{
          model: Role,
          as: 'roles',
          through: { attributes: [] },
          include: [{
            model: Ability,
            as: 'abilities'
          }]
        },
        {
          model: UserAbility,
          as: 'userAbilities'
        }]
      });

      // NUOVO: Aggiungi informazioni sul ruolo attivo se presente
      const userData = user.toJSON();
      if (req.user.active_role_id) {
        const activeRole = user.roles.find(role => role.id === req.user.active_role_id);
        userData.active_role = activeRole ? {
          id: activeRole.id,
          name: activeRole.name,
          description: activeRole.description
        } : null;
      }

      // Restituisci risposta
      res.json({
        status: 'success',
        data: {
          user: userData
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante il recupero delle informazioni utente');
      next(error);
    }
  }

  /**
   * Aggiorna le impostazioni di autenticazione dell'utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async updateAuthSettings(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      const user = req.user;
      const { default_role_id, auto_login_with_default, last_used_roles } = req.body;

      logger.info(`Aggiornamento impostazioni auth per utente ${user.username}`);

      // Verifica che il ruolo predefinito sia valido per l'utente
      if (default_role_id) {
        const isValidRole = user.roles.some(role => role.id === default_role_id && role.active !== false);
        if (!isValidRole) {
          return next(AppError.authorization('Il ruolo predefinito specificato non è disponibile per questo utente'));
        }
      }

      // Verifica che i ruoli in last_used_roles siano validi
      if (last_used_roles && Array.isArray(last_used_roles)) {
        const userRoleIds = user.roles.filter(role => role.active !== false).map(role => role.id);
        const invalidRoles = last_used_roles.filter(roleId => !userRoleIds.includes(roleId));
        
        if (invalidRoles.length > 0) {
          return next(AppError.authorization(`I seguenti ruoli non sono disponibili: ${invalidRoles.join(', ')}`));
        }
      }

      // Aggiorna i settings usando il servizio
      const updatedSettings = await userSettingsService.updateAuthSettings(user, {
        ...(default_role_id !== undefined && { default_role_id }),
        ...(auto_login_with_default !== undefined && { auto_login_with_default }),
        ...(last_used_roles !== undefined && { last_used_roles })
      });

      logger.info(`Impostazioni auth aggiornate per utente ${user.username}`);

      res.json({
        status: 'success',
        message: 'Impostazioni di autenticazione aggiornate con successo',
        data: {
          auth_settings: updatedSettings
        }
      });

    } catch (error) {
      logger.error({ err: error }, 'Errore durante aggiornamento impostazioni auth');
      next(error);
    }
  }

  /**
   * Ottiene statistiche dettagliate utilizzo ruoli e preferenze
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getRoleUsageStats(req, res, next) {
    try {
      const user = req.user;
      const stats = userSettingsService.getRoleUsageStats(user);
      const settings = userSettingsService.getAuthSettings(user);

      // Arricchisci con dati addizionali
      const enhancedStats = stats.map(stat => ({
        ...stat,
        can_auto_login: settings.auto_login_with_default && stat.is_default,
        usage_frequency: this.calculateUsageFrequency(stat.id, settings.last_used_roles)
      }));

      res.json({
        status: 'success',
        data: {
          role_stats: enhancedStats,
          auth_settings: settings,
          recommendations: this.generateRoleRecommendations(enhancedStats, settings)
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante recupero statistiche ruoli avanzate');
      next(error);
    }
  }

  /**
   * Ottiene statistiche del rate limiting (solo per amministratori)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getRateLimitStats(req, res, next) {
    try {
      // Usa la funzione di utility per accedere all'istanza singleton
      const authRateLimiterMiddleware = require('../../middleware/authRateLimiterMiddleware');
      
      logger.info(`Richiesta statistiche rate limiting da ${req.user.username}`);

      // Accedi all'istanza tramite il modulo (è già un singleton)
      const stats = authRateLimiterMiddleware.authRateLimiterMiddleware.getStats();

      res.json({
        status: 'success',
        data: {
          rate_limit_stats: stats,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error({ err: error }, 'Errore durante recupero statistiche rate limiting');
      next(error);
    }
  }

  /**
   * Reset rate limiting per IP o utente (solo per amministratori)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async resetRateLimit(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      const { identifier, type } = req.body;
      const authRateLimiterMiddleware = require('../../middleware/authRateLimiterMiddleware');

      logger.info(`Reset rate limiting richiesto da ${req.user.username} per ${type}:${identifier}`);

      // Accedi all'istanza tramite il modulo (è già un singleton)
      const resetCount = authRateLimiterMiddleware.authRateLimiterMiddleware.reset(identifier, type);

      res.json({
        status: 'success',
        message: `Rate limiting reset completato per ${type}:${identifier}`,
        data: {
          entries_removed: resetCount,
          identifier,
          type,
          reset_by: req.user.username,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error({ err: error }, 'Errore durante reset rate limiting');
      next(error);
    }
  }

  // --- METODI HELPER PRIVATI ---

  /**
   * Autentica un utente con username/email e password
   * @param {string} username - Username o email
   * @param {string} password - Password
   * @param {string} tenantId - ID del tenant
   * @returns {Object} - Utente autenticato
   * @private
   */
  async authenticateUser(username, password, tenantId) {
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { username },
          { email: username }
        ],
        tenant_id: tenantId,
        active: true
      },
      include: [{
        model: Role,
        as: 'roles',
        through: { attributes: [] },
        include: [{
          model: Ability,
          as: 'abilities'
        }]
      },
      {
        model: UserAbility,
        as: 'userAbilities'
      }]
    });

    if (!user) {
      throw AppError.authentication('Credenziali non valide');
    }

    const isPasswordValid = await user.validPassword(password);
    if (!isPasswordValid) {
      throw AppError.authentication('Credenziali non valide');
    }

    if (!user.roles || user.roles.length === 0) {
      throw AppError.authorization('Utente senza ruoli assegnati');
    }

    return user;
  }

  /**
   * Gestisce la logica di login multi-ruolo
   * @param {Object} user - Utente autenticato
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   * @private
   */
  async handleMultiRoleLogin(user, req, res, next) {
    const activeRoles = user.roles.filter(role => role.active !== false);

    // Caso 1: Nessun ruolo attivo
    if (activeRoles.length === 0) {
      logger.warn(`Login negato: utente ${user.username} non ha ruoli attivi`);
      return next(AppError.authorization('Nessun ruolo attivo assegnato'));
    }

    // Caso 2: Un solo ruolo - login immediato
    if (activeRoles.length === 1) {
      logger.info(`Login single-role per ${user.username}: ${activeRoles[0].name}`);
      return await this.completeLoginWithRole(user, activeRoles[0].id, req, res, next);
    }

    // Caso 3: Più ruoli - verifica auto-login
    if (abilityService.canAutoLoginWithDefaultRole(user)) {
      const defaultRoleId = user.settings.auth.default_role_id;
      logger.info(`Auto-login con ruolo predefinito per ${user.username}: ${defaultRoleId}`);
      return await this.completeLoginWithRole(user, defaultRoleId, req, res, next);
    }

    // Caso 4: Richiedi selezione ruolo
    logger.info(`Richiesta selezione ruolo per ${user.username} (${activeRoles.length} ruoli disponibili)`);
    return await this.requestRoleSelection(user, activeRoles, req, res, next);
  }

  /**
   * Richiede la selezione del ruolo all'utente
   * @param {Object} user - Utente autenticato
   * @param {Array} activeRoles - Ruoli attivi dell'utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   * @private
   */
  async requestRoleSelection(user, activeRoles, req, res, next) {
    // Genera token di pre-autenticazione
    const roleIds = activeRoles.map(role => role.id);
    const preAuthData = jwtService.generatePreAuthToken(user, roleIds);

    // Prepara la lista dei ruoli con metadata
    const availableRoles = activeRoles.map(role => ({
      id: role.id,
      name: role.name,
      description: role.description,
      is_default: abilityService.isDefaultRole(user, role.id),
      is_last_used: abilityService.isLastUsedRole(user, role.id)
    }));

    res.json({
      status: 'choose_role',
      message: 'Seleziona il ruolo con cui accedere',
      data: {
        preAuthToken: preAuthData.preAuthToken,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email
        },
        available_roles: availableRoles
      }
    });
  }

  /**
   * Completa il login con un ruolo specifico
   * @param {Object} user - Utente autenticato
   * @param {string} roleId - ID del ruolo attivo
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   * @private
   */
  async completeLoginWithRole(user, roleId, req, res, next) {
    try {
      // Trova i dettagli del ruolo
      const activeRole = user.roles.find(role => role.id === roleId);
      if (!activeRole) {
        throw AppError.authorization('Ruolo non trovato');
      }

      // Aggiorna le statistiche di utilizzo ruoli
      await this.updateRoleUsageStats(user, roleId);

      // Genera i token con il ruolo attivo
      const tokens = jwtService.generateTokens(user, roleId);

      // Aggiorna il remember_token nel database
      await user.update({ remember_token: tokens.refreshTokenId });

      logger.info(`Login completato per ${user.username} con ruolo ${activeRole.name}`);

      res.json({
        status: 'success',
        message: 'Login effettuato con successo',
        data: {
          user: {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            tenant_id: user.tenant_id,
            active_role: {
              id: activeRole.id,
              name: activeRole.name,
              description: activeRole.description
            }
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expires: tokens.expires
        }
      });

    } catch (error) {
      logger.error({ err: error }, 'Errore durante il completamento login');
      throw error;
    }
  }

  /**
   * Aggiorna le statistiche di utilizzo dei ruoli per l'utente
   * @param {Object} user - Utente
   * @param {string} roleId - ID del ruolo utilizzato
   * @private
   */
  async updateRoleUsageStats(user, roleId) {
    try {
      await userSettingsService.addToRecentRoles(user, roleId);
      logger.debug(`Aggiornate statistiche utilizzo ruolo per ${user.username}: ${roleId}`);
    } catch (error) {
      logger.error({ err: error }, 'Errore durante aggiornamento statistiche ruolo');
      // Non propagare l'errore, non è critico
    }
  }

  /**
   * NUOVO: Converte un'ability CASL in formato semplificato per il frontend
   * @param {Ability} ability - Ability CASL
   * @param {Object} user - Utente
   * @returns {Object} - Abilities in formato UI
   * @private
   */
  convertAbilityToUIFormat(ability, user) {
    // Ottieni tutte le regole dall'ability
    const rules = ability.rules;

    // Raggruppa per subject
    const subjectAbilities = {};

    rules.forEach(rule => {
      const subject = rule.subject;
      
      if (!subjectAbilities[subject]) {
        subjectAbilities[subject] = {
          can: [],
          cannot: [],
          fields: {}
        };
      }

      const ruleData = {
        action: rule.action,
        conditions: rule.conditions || null,
        reason: rule.reason || null
      };

      // Separa regole positive e negative
      if (rule.inverted) {
        subjectAbilities[subject].cannot.push(ruleData);
      } else {
        subjectAbilities[subject].can.push(ruleData);
      }

      // Gestione permissions sui campi
      if (rule.fields && rule.fields.length > 0) {
        rule.fields.forEach(field => {
          if (!subjectAbilities[subject].fields[field]) {
            subjectAbilities[subject].fields[field] = {
              can: [],
              cannot: []
            };
          }

          const fieldRule = {
            action: rule.action,
            conditions: rule.conditions || null
          };

          if (rule.inverted) {
            subjectAbilities[subject].fields[field].cannot.push(fieldRule);
          } else {
            subjectAbilities[subject].fields[field].can.push(fieldRule);
          }
        });
      }
    });

    // Aggiungi funzioni di utilità per il frontend
    return {
      subjects: subjectAbilities,
      // Metodi helper che il frontend può utilizzare
      helpers: {
        can: (action, subject, field = null) => {
          return ability.can(action, subject, field);
        },
        cannot: (action, subject, field = null) => {
          return ability.cannot(action, subject, field);
        }
      },
      // Meta informazioni utili per debug
      meta: {
        total_rules: rules.length,
        subjects_count: Object.keys(subjectAbilities).length,
        rules_by_type: {
          can: rules.filter(r => !r.inverted).length,
          cannot: rules.filter(r => r.inverted).length
        }
      }
    };
  }

  /**
   * Calcola frequenza utilizzo ruolo
   * @private
   */
  calculateUsageFrequency(roleId, recentRoles) {
    if (!recentRoles || !recentRoles.includes(roleId)) return 0;
    const position = recentRoles.indexOf(roleId);
    return Math.max(0, 5 - position); // 5 = più recente, 1 = meno recente
  }

  /**
   * Genera raccomandazioni per l'utente
   * @private
   */
  generateRoleRecommendations(stats, settings) {
    const recommendations = [];
    
    const mostUsed = stats.find(s => s.recent_position === 1);
    if (mostUsed && !settings.default_role_id) {
      recommendations.push({
        type: 'set_default',
        message: `Considera di impostare "${mostUsed.name}" come ruolo predefinito`,
        role_id: mostUsed.id
      });
    }

    if (stats.length > 1 && settings.default_role_id && !settings.auto_login_with_default) {
      recommendations.push({
        type: 'enable_auto_login',
        message: 'Abilita auto-login per accedere più velocemente'
      });
    }

    return recommendations;
  }
}

module.exports = new AuthController();