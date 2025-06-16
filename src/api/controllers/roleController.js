'use strict';

const { Role, Ability, sequelize } = require('../../models');
const { AppError } = require('../../middleware/errorHandler');
const { validationResult } = require('express-validator');
const { createLogger } = require('../../utils/logger');
const logger = createLogger('controllers:role');
const { Op } = require('sequelize');

/**
 * Controller per la gestione dei ruoli
 * Utilizza il nuovo sistema di autorizzazione basato su policy middleware
 */
class RoleController {
  /**
   * Ottiene la lista dei ruoli
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getRoles(req, res, next) {
    try {
      // Estrai parametri di query
      const {
        page = 1,
        limit = 10,
        sort_by = 'name',
        sort_dir = 'ASC',
        search
      } = req.query;

      // Calcola offset per paginazione
      const offset = (page - 1) * limit;

      // Costruisci condizioni di ricerca base
      const where = {};

      // Applica filtro di ricerca testuale
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Se ci sono condizioni di filtro basate sui permessi, applicale
      if (req.queryOptions && req.queryOptions.where) {
        Object.assign(where, req.queryOptions.where);
      }

      // Esegui la query con tutti i filtri
      const { count, rows: roles } = await Role.findAndCountAll({
        where,
        include: [
          {
            model: Ability,
            as: 'abilities'
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
          roles,
          pagination: {
            total: count,
            page: parseInt(page),
            limit: parseInt(limit),
            total_pages: totalPages
          }
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante il recupero dei ruoli');
      next(error);
    }
  }

  /**
   * Ottiene un ruolo specifico per ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getRoleById(req, res, next) {
    try {
      // req.resource è già caricato dal middleware
      const role = req.resource;

      // Carica relazioni aggiuntive se necessario
      const roleWithAbilities = await Role.findByPk(role.id, {
        include: [
          {
            model: Ability,
            as: 'abilities'
          }
        ]
      });

      res.json({
        status: 'success',
        data: {
          role: roleWithAbilities
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante il recupero di un ruolo specifico');
      next(error);
    }
  }

  /**
   * Crea un nuovo ruolo
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async createRole(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      const { abilities = [], ...roleData } = req.body;

      // L'autorizzazione è già stata verificata dal middleware

      // Verifica nome ruolo unico
      const existingRole = await Role.findOne({
        where: {
          name: roleData.name
        }
      });

      if (existingRole) {
        return next(AppError.conflict(`Esiste già un ruolo con il nome "${roleData.name}"`));
      }

      // Inizia una transazione
      const transaction = await sequelize.transaction();

      try {
        // Crea il nuovo ruolo
        const role = await Role.create(roleData, { transaction });

        // Assegna abilities se specificate
        if (abilities.length > 0) {
          // Crea le abilities
          const abilitiesToCreate = abilities.map(ability => ({
            role_id: role.id,
            action: ability.action,
            subject: ability.subject,
            conditions: ability.conditions || null,
            fields: ability.fields || null,
            inverted: ability.inverted || false,
            reason: ability.reason || null
          }));

          await Ability.bulkCreate(abilitiesToCreate, { transaction });
        }

        // Commit della transazione
        await transaction.commit();

        logger.info(`Nuovo ruolo creato: ${role.name} (${role.id})`);

        // Carica il ruolo con le abilities
        const roleWithAbilities = await Role.findByPk(role.id, {
          include: [
            {
              model: Ability,
              as: 'abilities'
            }
          ]
        });

        // Restituisci il ruolo creato
        res.status(201).json({
          status: 'success',
          message: 'Ruolo creato con successo',
          data: {
            role: roleWithAbilities
          }
        });
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la creazione di un ruolo');
      next(error);
    }
  }

  /**
   * Aggiorna un ruolo esistente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async updateRole(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      // Il ruolo è già caricato dal middleware in req.resource
      const role = req.resource;
      const updateData = req.body;

      // L'autorizzazione è già stata verificata dal middleware

      // Verifica nome ruolo unico (se viene modificato)
      if (updateData.name && updateData.name !== role.name) {
        const existingRole = await Role.findOne({
          where: {
            name: updateData.name,
            id: { [Op.ne]: role.id }
          }
        });

        if (existingRole) {
          return next(AppError.conflict(`Esiste già un ruolo con il nome "${updateData.name}"`));
        }
      }

      // Inizia una transazione
      const transaction = await sequelize.transaction();

      try {
        // Aggiorna il ruolo
        await role.update(updateData, { transaction });

        // Commit della transazione
        await transaction.commit();

        logger.info(`Ruolo aggiornato: ${role.name} (${role.id})`);

        // Carica il ruolo aggiornato
        const updatedRole = await Role.findByPk(role.id, {
          include: [
            {
              model: Ability,
              as: 'abilities'
            }
          ]
        });

        // Restituisci il ruolo aggiornato
        res.json({
          status: 'success',
          message: 'Ruolo aggiornato con successo',
          data: {
            role: updatedRole
          }
        });
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore durante l\'aggiornamento di un ruolo');
      next(error);
    }
  }

  /**
   * Elimina un ruolo
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async deleteRole(req, res, next) {
    try {
      // Il ruolo è già caricato dal middleware in req.resource
      const role = req.resource;

      // L'autorizzazione è già stata verificata dal middleware

      // Verifica se ci sono utenti che utilizzano questo ruolo
      const userCount = await sequelize.models.UserRole.count({
        where: { role_id: role.id }
      });

      if (userCount > 0) {
        return next(AppError.conflict(`Impossibile eliminare il ruolo: è assegnato a ${userCount} utenti`));
      }

      // Inizia una transazione
      const transaction = await sequelize.transaction();

      try {
        // Elimina prima tutte le abilities associate al ruolo
        await Ability.destroy({
          where: { role_id: role.id },
          transaction
        });

        // Elimina il ruolo
        await role.destroy({ transaction });

        // Commit della transazione
        await transaction.commit();

        logger.info(`Ruolo eliminato: ${role.name} (${role.id})`);

        // Restituisci risposta
        res.json({
          status: 'success',
          message: 'Ruolo eliminato con successo'
        });
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore durante l\'eliminazione di un ruolo');
      next(error);
    }
  }

  /**
   * Assegna abilities a un ruolo
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async assignAbilities(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      // Il ruolo è già caricato dal middleware in req.resource
      const role = req.resource;
      const { abilities } = req.body;

      // L'autorizzazione è già stata verificata dal middleware

      // Inizia una transazione
      const transaction = await sequelize.transaction();

      try {
        // Crea le nuove abilities
        const abilitiesToCreate = abilities.map(ability => ({
          role_id: role.id,
          action: ability.action,
          subject: ability.subject,
          conditions: ability.conditions || null,
          fields: ability.fields || null,
          inverted: ability.inverted || false,
          reason: ability.reason || null
        }));

        await Ability.bulkCreate(abilitiesToCreate, { transaction });

        // Commit della transazione
        await transaction.commit();

        logger.info(`Abilities assegnate al ruolo: ${role.name} (${role.id})`);

        // Carica il ruolo con le abilities aggiornate
        const updatedRole = await Role.findByPk(role.id, {
          include: [
            {
              model: Ability,
              as: 'abilities'
            }
          ]
        });

        // Restituisci il ruolo aggiornato
        res.json({
          status: 'success',
          message: 'Abilities assegnate con successo',
          data: {
            role: updatedRole
          }
        });
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore durante l\'assegnazione delle abilities');
      next(error);
    }
  }

  /**
   * Rimuove abilities da un ruolo
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async removeAbilities(req, res, next) {
    try {
      // Il ruolo è già caricato dal middleware in req.resource
      const role = req.resource;
      const { ability_ids } = req.body;

      // L'autorizzazione è già stata verificata dal middleware

      if (!ability_ids || !Array.isArray(ability_ids) || ability_ids.length === 0) {
        return next(AppError.validation('Specificare gli ID delle abilities da rimuovere'));
      }

      // Inizia una transazione
      const transaction = await sequelize.transaction();

      try {
        // Elimina le abilities specificate
        await Ability.destroy({
          where: {
            id: ability_ids,
            role_id: role.id
          },
          transaction
        });

        // Commit della transazione
        await transaction.commit();

        logger.info(`Abilities rimosse dal ruolo: ${role.name} (${role.id})`);

        // Carica il ruolo con le abilities aggiornate
        const updatedRole = await Role.findByPk(role.id, {
          include: [
            {
              model: Ability,
              as: 'abilities'
            }
          ]
        });

        // Restituisci il ruolo aggiornato
        res.json({
          status: 'success',
          message: 'Abilities rimosse con successo',
          data: {
            role: updatedRole
          }
        });
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la rimozione delle abilities');
      next(error);
    }
  }

  /**
   * Sostituisce completamente le abilities di un ruolo
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async replaceAbilities(req, res, next) {
    try {
      // Validazione degli input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }

      // Il ruolo è già caricato dal middleware in req.resource
      const role = req.resource;
      const { abilities } = req.body;

      // L'autorizzazione è già stata verificata dal middleware

      // Inizia una transazione
      const transaction = await sequelize.transaction();

      try {
        // Elimina tutte le abilities correnti
        await Ability.destroy({
          where: { role_id: role.id },
          transaction
        });

        // Se sono state specificate nuove abilities, creale
        if (abilities && abilities.length > 0) {
          const abilitiesToCreate = abilities.map(ability => ({
            role_id: role.id,
            action: ability.action,
            subject: ability.subject,
            conditions: ability.conditions || null,
            fields: ability.fields || null,
            inverted: ability.inverted || false,
            reason: ability.reason || null
          }));

          await Ability.bulkCreate(abilitiesToCreate, { transaction });
        }

        // Commit della transazione
        await transaction.commit();

        logger.info(`Abilities sostituite per il ruolo: ${role.name} (${role.id})`);

        // Carica il ruolo con le abilities aggiornate
        const updatedRole = await Role.findByPk(role.id, {
          include: [
            {
              model: Ability,
              as: 'abilities'
            }
          ]
        });

        // Restituisci il ruolo aggiornato
        res.json({
          status: 'success',
          message: 'Abilities sostituite con successo',
          data: {
            role: updatedRole
          }
        });
      } catch (error) {
        // Rollback in caso di errore
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la sostituzione delle abilities');
      next(error);
    }
  }
}

module.exports = new RoleController();