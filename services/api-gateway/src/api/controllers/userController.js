'use strict';

const { User, Role, UserRole, sequelize } = require('../../models');
const { AppError } = require('../../middleware/errorHandler');
const { validationResult } = require('express-validator');
const { createLogger } = require('../../utils/logger');
const userSettingsService = require('../../services/userSettingsService');
const logger = createLogger('controllers:user');
const { Op } = require('sequelize');

/**
 * Controller per la gestione degli utenti
 * Utilizza il nuovo sistema di autorizzazione basato su policy middleware
 */
class UserController {
  constructor() {
    // Bind di tutti i metodi per preservare il contesto this
    this.getUsers = this.getUsers.bind(this);
    this.getRoles = this.getRoles.bind(this);
    this.getUserById = this.getUserById.bind(this);
    this.createUser = this.createUser.bind(this);
    this.updateUser = this.updateUser.bind(this);
    this.deleteUser = this.deleteUser.bind(this);
    this.assignRoles = this.assignRoles.bind(this);
    this.updateAuthSettings = this.updateAuthSettings.bind(this);
    this.getRoleUsageStats = this.getRoleUsageStats.bind(this);
  }

  /**
   * Ottiene la lista degli utenti
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getUsers(req, res, next) {
    try {
      // Estrai parametri di query
      const {
        page = 1,
        limit = 10,
        sort_by = 'username',
        sort_dir = 'ASC',
        search,
        active
      } = req.query;

      // Calcola offset per paginazione
      const offset = (page - 1) * limit;

      // Costruisci condizioni di ricerca base
      const where = {
        tenant_id: req.tenantId
      };

      // Applica filtro di ricerca testuale
      if (search) {
        where[Op.or] = [
          { username: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Applica filtro per stato attivo/inattivo
      if (active === 'true' || active === 'false') {
        where.active = active === 'true';
      }

      // Se ci sono condizioni di filtro basate sui permessi, applicale
      if (req.queryOptions && req.queryOptions.where) {
        Object.assign(where, req.queryOptions.where);
      }

      // Esegui la query con tutti i filtri
      const { count, rows: users } = await User.findAndCountAll({
        where,
        include: [
          {
            model: Role,
            as: 'roles',
            through: { attributes: [] }
          }
        ],
        order: [[sort_by, sort_dir]],
        limit: parseInt(limit),
        offset,
        distinct: true
      });

      // Calcola informazioni sulla paginazione
      const totalPages = Math.ceil(count / limit);

      res.json({
        status: 'success',
        data: {
          users,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            total_pages: totalPages
          }
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante il recupero degli utenti');
      next(error);
    }
  }

  /**
   * Ottiene i ruoli disponibili per l'assegnazione
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getRoles(req, res, next) {
    try {
      const roles = await Role.findAll({
        order: [['name', 'ASC']]
      });

      res.json({
        status: 'success',
        data: {
          roles
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante il recupero dei ruoli');
      next(error);
    }
  }

  /**
   * Ottiene un utente specifico per ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getUserById(req, res, next) {
    try {
      // req.resource è già caricato dal middleware
      const user = req.resource;

      // Carica relazioni aggiuntive se necessario
      const userWithRoles = await User.findByPk(user.id, {
        include: [
          {
            model: Role,
            as: 'roles',
            through: { attributes: [] }
          }
        ]
      });

      res.json({
        status: 'success',
        data: {
          user: userWithRoles
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante il recupero di un utente specifico');
      next(error);
    }
  }

  /**
   * Crea un nuovo utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async createUser(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      const { roles = [], ...userData } = req.body;

      // L'autorizzazione è già stata verificata dal middleware

      // Verifica username e email unici
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [
            { username: userData.username },
            { email: userData.email }
          ]
        }
      });

      if (existingUser) {
        if (existingUser.username === userData.username) {
          return next(AppError.conflict(`Username "${userData.username}" già in uso`));
        } else {
          return next(AppError.conflict(`Email "${userData.email}" già in uso`));
        }
      }

      // Inizia una transazione
      const transaction = await sequelize.transaction();

      try {
        // Crea il nuovo utente
        const user = await User.create(
          {
            ...userData,
            tenant_id: req.tenantId
          },
          { transaction }
        );

        // Assegna ruoli se specificati
        if (roles.length > 0) {
          const rolesToAssign = await Role.findAll({
            where: {
              id: roles
            }
          });

          await user.setRoles(rolesToAssign, { transaction });
        }

        // Commit della transazione
        await transaction.commit();

        logger.info(`Nuovo utente creato: ${user.username} (${user.id})`);

        // Carica l'utente con i ruoli
        const userWithRoles = await User.findByPk(user.id, {
          include: [
            {
              model: Role,
              as: 'roles',
              through: { attributes: [] }
            }
          ]
        });

        // Restituisci l'utente creato
        res.status(201).json({
          status: 'success',
          message: 'Utente creato con successo',
          data: {
            user: userWithRoles
          }
        });
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la creazione di un utente');
      next(error);
    }
  }

  /**
   * Aggiorna un utente esistente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async updateUser(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      // L'utente è già caricato dal middleware in req.resource
      const user = req.resource;
      const { roles, ...updateData } = req.body;

      // L'autorizzazione è già stata verificata dal middleware
      // incluso il controllo dei campi che l'utente può modificare

      // Verifica username e email unici (se vengono modificati)
      if (updateData.username && updateData.username !== user.username) {
        const existingUsername = await User.findOne({
          where: {
            username: updateData.username,
            id: { [Op.ne]: user.id }
          }
        });

        if (existingUsername) {
          return next(AppError.conflict(`Username "${updateData.username}" già in uso`));
        }
      }

      if (updateData.email && updateData.email !== user.email) {
        const existingEmail = await User.findOne({
          where: {
            email: updateData.email,
            id: { [Op.ne]: user.id }
          }
        });

        if (existingEmail) {
          return next(AppError.conflict(`Email "${updateData.email}" già in uso`));
        }
      }

      // Inizia una transazione
      const transaction = await sequelize.transaction();

      try {
        // Aggiorna l'utente
        await user.update(updateData, { transaction });

        // Aggiorna ruoli se specificati
        if (roles && Array.isArray(roles)) {
          const rolesToAssign = await Role.findAll({
            where: {
              id: roles
            }
          });

          await user.setRoles(rolesToAssign, { transaction });
        }

        // Commit della transazione
        await transaction.commit();

        logger.info(`Utente aggiornato: ${user.username} (${user.id})`);

        // Carica l'utente aggiornato con i ruoli
        const updatedUser = await User.findByPk(user.id, {
          include: [
            {
              model: Role,
              as: 'roles',
              through: { attributes: [] }
            }
          ]
        });

        // Restituisci l'utente aggiornato
        res.json({
          status: 'success',
          message: 'Utente aggiornato con successo',
          data: {
            user: updatedUser
          }
        });
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore durante l\'aggiornamento di un utente');
      next(error);
    }
  }

  /**
   * Elimina un utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async deleteUser(req, res, next) {
    try {
      // L'utente è già caricato dal middleware in req.resource
      const user = req.resource;

      // L'autorizzazione è già stata verificata dal middleware

      // Inizia una transazione
      const transaction = await sequelize.transaction();

      try {
        // Elimina l'utente (soft delete, grazie a paranoid: true nel modello)
        await user.destroy({ transaction });

        // Commit della transazione
        await transaction.commit();

        logger.info(`Utente eliminato: ${user.username} (${user.id})`);

        // Restituisci risposta
        res.json({
          status: 'success',
          message: 'Utente eliminato con successo'
        });
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore durante l\'eliminazione di un utente');
      next(error);
    }
  }

  /**
   * Assegna ruoli a un utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async assignRoles(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      // L'utente è già caricato dal middleware in req.resource
      const user = req.resource;
      const { roles } = req.body;

      // L'autorizzazione è già stata verificata dal middleware

      // Inizia una transazione
      const transaction = await sequelize.transaction();

      try {
        // Ottieni i ruoli da assegnare
        const rolesToAssign = await Role.findAll({
          where: {
            id: roles
          }
        });

        if (rolesToAssign.length !== roles.length) {
          await transaction.rollback();
          return next(AppError.validation('Uno o più ruoli specificati non esistono'));
        }

        // Assegna i ruoli
        await user.setRoles(rolesToAssign, { transaction });

        // Commit della transazione
        await transaction.commit();

        logger.info(`Ruoli assegnati all'utente: ${user.username} (${user.id})`);

        // Carica l'utente con i ruoli aggiornati
        const updatedUser = await User.findByPk(user.id, {
          include: [
            {
              model: Role,
              as: 'roles',
              through: { attributes: [] }
            }
          ]
        });

        // Restituisci l'utente aggiornato
        res.json({
          status: 'success',
          message: 'Ruoli assegnati con successo',
          data: {
            user: updatedUser
          }
        });
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore durante l\'assegnazione dei ruoli');
      next(error);
    }
  }

  /**
   * Aggiorna le impostazioni di autenticazione dell'utente (wrapper)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async updateAuthSettings(req, res, next) {
    try {
      const authController = require('./authController');
      return await authController.updateAuthSettings(req, res, next);
    } catch (error) {
      logger.error({ err: error }, 'Errore durante aggiornamento impostazioni auth');
      next(error);
    }
  }

  /**
   * Ottiene le statistiche di utilizzo dei ruoli per l'utente corrente
   * @param {Object} req - Request object
   * @param {Object} res - Response object  
   * @param {Function} next - Next middleware
   */
  async getRoleUsageStats(req, res, next) {
    try {
      const user = req.user;
      const stats = userSettingsService.getRoleUsageStats(user);

      res.json({
        status: 'success',
        data: {
          role_usage_stats: stats,
          current_settings: userSettingsService.getAuthSettings(user)
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante recupero statistiche ruoli');
      next(error);
    }
  }
}

module.exports = new UserController();