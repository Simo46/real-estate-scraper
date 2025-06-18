'use strict';

const { Op } = require('sequelize');
const { User, UserAbility, sequelize } = require('../../models');
const { AppError } = require('../../middleware/errorHandler');
const { createLogger } = require('../../utils/logger');
const { validationResult } = require('express-validator');
const logger = createLogger('controllers:userAbility');

/**
 * Controller per la gestione dei permessi individuali degli utenti
 * AGGIORNATO: Supporto per role_context_id
 */
class UserAbilityController {
  /**
   * AGGIORNATO: Ottiene tutti i permessi individuali di un utente specifico
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getUserAbilities(req, res, next) {
    try {
      const userId = req.params.userId;
      const { role_context_id, include_global = true } = req.query;
      
      const where = req.queryOptions?.where || { user_id: userId };
      
      // NUOVO: Aggiungi filtri per role_context_id se specificato
      if (role_context_id) {
        if (include_global === 'true' || include_global === true) {
          where[Op.or] = [
            { role_context_id: role_context_id },
            { role_context_id: null }
          ];
        } else {
          where.role_context_id = role_context_id;
        }
      }
      
      const userAbilities = await UserAbility.findAll({
        where,
        include: [
          {
            model: sequelize.models.Role,
            as: 'roleContext',
            attributes: ['id', 'name', 'description']
          }
        ],
        order: [
          ['priority', 'DESC'],
          ['created_at', 'DESC']
        ]
      });
      
      // NUOVO: Aggiungi statistiche sui permessi
      const stats = {
        total: userAbilities.length,
        global: userAbilities.filter(a => !a.role_context_id).length,
        role_specific: userAbilities.filter(a => a.role_context_id).length,
        expired: userAbilities.filter(a => a.isExpired()).length
      };
      
      res.json({
        status: 'success',
        data: {
          userAbilities,
          stats
        }
      });
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Ottiene un permesso individuale specifico
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getUserAbilityById(req, res, next) {
    try {
      const { userId, abilityId } = req.params;
      
      const userAbility = await UserAbility.findOne({
        where: {
          id: abilityId,
          user_id: userId,
          tenant_id: req.tenantId
        },
        include: [
          {
            model: sequelize.models.Role,
            as: 'roleContext',
            attributes: ['id', 'name', 'description']
          }
        ]
      });
      
      if (!userAbility) {
        return next(AppError.notFound('Permesso individuale non trovato'));
      }
      
      res.json({
        status: 'success',
        data: {
          userAbility
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante il recupero del permesso individuale');
      next(error);
    }
  }
  
  /**
   * AGGIORNATO: Crea un nuovo permesso individuale per un utente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async createUserAbility(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }
      
      const { userId } = req.params;
      const {
        action,
        subject,
        conditions,
        fields,
        inverted,
        priority,
        reason,
        expiresAt,
        role_context_id
      } = req.body;
      
      const user = await User.findOne({
        where: {
          id: userId,
          tenant_id: req.tenantId
        }
      });
      
      if (!user) {
        return next(AppError.notFound('Utente non trovato'));
      }
      
      // NUOVO: Validazione aggiuntiva per role_context_id
      if (role_context_id) {
        const hasRole = await sequelize.models.UserRole.findOne({
          where: {
            user_id: userId,
            role_id: role_context_id,
            tenant_id: req.tenantId
          }
        });
        
        if (!hasRole) {
          return next(AppError.validation('L\'utente non ha il ruolo specificato come contesto'));
        }
        
        logger.info(`Creazione permesso individuale con contesto ruolo ${role_context_id} per utente ${userId}`);
      } else {
        logger.info(`Creazione permesso individuale globale per utente ${userId}`);
      }
      
      // Verifica duplicati
      const existingAbility = await UserAbility.findOne({
        where: {
          user_id: userId,
          tenant_id: req.tenantId,
          action,
          subject,
          inverted: inverted || false,
          role_context_id: role_context_id || null
        }
      });
      
      if (existingAbility) {
        const contextDesc = role_context_id ? ` per il ruolo specificato` : ` globale`;
        return next(AppError.conflict(`Esiste già un permesso individuale${contextDesc} con questa azione e soggetto`));
      }
      
      // Crea il nuovo permesso individuale
      const userAbility = await UserAbility.create({
        user_id: userId,
        tenant_id: req.tenantId,
        action,
        subject,
        conditions: conditions || null,
        fields: fields || null,
        inverted: inverted || false,
        priority: priority || 10,
        reason: reason || null,
        expires_at: expiresAt || null,
        role_context_id: role_context_id || null,
        created_by: req.user.id,
        updated_by: req.user.id
      });
      
      const contextDesc = role_context_id ? ` con contesto ruolo ${role_context_id}` : ` globale`;
      logger.info(`Permesso individuale${contextDesc} creato per l'utente ${userId} da ${req.user.username}`);
      
      // Carica il permesso con le relazioni per la risposta
      const createdAbility = await UserAbility.findByPk(userAbility.id, {
        include: [
          {
            model: sequelize.models.Role,
            as: 'roleContext',
            attributes: ['id', 'name', 'description']
          }
        ]
      });
      
      res.status(201).json({
        status: 'success',
        message: 'Permesso individuale creato con successo',
        data: {
          userAbility: createdAbility
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la creazione del permesso individuale');
      next(error);
    }
  }
  
  /**
   * AGGIORNATO: Aggiorna un permesso individuale esistente
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async updateUserAbility(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(AppError.validation('Errori di validazione', errors.array()));
      }
      
      const { userId, abilityId } = req.params;
      const {
        action,
        subject,
        conditions,
        fields,
        inverted,
        priority,
        reason,
        expiresAt,
        role_context_id
      } = req.body;
      
      const userAbility = await UserAbility.findOne({
        where: {
          id: abilityId,
          user_id: userId,
          tenant_id: req.tenantId
        }
      });
      
      if (!userAbility) {
        return next(AppError.notFound('Permesso individuale non trovato'));
      }
      
      // NUOVO: Validazione aggiuntiva per role_context_id se viene modificato
      if (role_context_id !== undefined && role_context_id !== userAbility.role_context_id) {
        if (role_context_id) {
          const hasRole = await sequelize.models.UserRole.findOne({
            where: {
              user_id: userId,
              role_id: role_context_id,
              tenant_id: req.tenantId
            }
          });
          
          if (!hasRole) {
            return next(AppError.validation('L\'utente non ha il ruolo specificato come contesto'));
          }
          
          logger.info(`Aggiornamento contesto ruolo a ${role_context_id} per permesso ${abilityId}`);
        } else {
          logger.info(`Rimozione contesto ruolo per permesso ${abilityId} (diventa globale)`);
        }
      }
      
      // Prepara i dati di aggiornamento
      const updateData = {};
      if (action !== undefined) updateData.action = action;
      if (subject !== undefined) updateData.subject = subject;
      if (conditions !== undefined) updateData.conditions = conditions;
      if (fields !== undefined) updateData.fields = fields;
      if (inverted !== undefined) updateData.inverted = inverted;
      if (priority !== undefined) updateData.priority = priority;
      if (reason !== undefined) updateData.reason = reason;
      if (expiresAt !== undefined) updateData.expires_at = expiresAt;
      if (role_context_id !== undefined) updateData.role_context_id = role_context_id;
      updateData.updated_by = req.user.id;
      
      await userAbility.update(updateData);
      
      const contextDesc = userAbility.role_context_id ? ` con contesto ruolo ${userAbility.role_context_id}` : ` globale`;
      logger.info(`Permesso individuale${contextDesc} aggiornato per l'utente ${userId} da ${req.user.username}`);
      
      // Carica il permesso aggiornato con le relazioni
      const updatedAbility = await UserAbility.findByPk(userAbility.id, {
        include: [
          {
            model: sequelize.models.Role,
            as: 'roleContext',
            attributes: ['id', 'name', 'description']
          }
        ]
      });
      
      res.json({
        status: 'success',
        message: 'Permesso individuale aggiornato con successo',
        data: {
          userAbility: updatedAbility
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante l\'aggiornamento del permesso individuale');
      next(error);
    }
  }
  
  /**
   * Elimina un permesso individuale
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async deleteUserAbility(req, res, next) {
    try {
      const { userId, abilityId } = req.params;
      
      const userAbility = await UserAbility.findOne({
        where: {
          id: abilityId,
          user_id: userId,
          tenant_id: req.tenantId
        }
      });
      
      if (!userAbility) {
        return next(AppError.notFound('Permesso individuale non trovato'));
      }
      
      await userAbility.destroy();
      
      const contextDesc = userAbility.role_context_id ? ` con contesto ruolo ${userAbility.role_context_id}` : ` globale`;
      logger.info(`Permesso individuale${contextDesc} eliminato per l'utente ${userId} da ${req.user.username}`);
      
      res.json({
        status: 'success',
        message: 'Permesso individuale eliminato con successo'
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante l\'eliminazione del permesso individuale');
      next(error);
    }
  }
  
  /**
   * Ottiene un riassunto combinato di tutti i permessi dell'utente (ruoli + individuali)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getUserEffectiveAbilities(req, res, next) {
    try {
      const { userId } = req.params;
      
      const user = await User.findOne({
        where: {
          id: userId,
          tenant_id: req.tenantId
        },
        include: [
          {
            model: sequelize.models.Role,
            as: 'roles',
            include: [
              {
                model: sequelize.models.Ability,
                as: 'abilities'
              }
            ]
          },
          {
            model: sequelize.models.UserAbility,
            as: 'userAbilities',
            where: {
              [Op.or]: [
                { expires_at: null },
                { expires_at: { [Op.gt]: new Date() } }
              ]
            },
            required: false,
            include: [
              {
                model: sequelize.models.Role,
                as: 'roleContext',
                attributes: ['id', 'name', 'description']
              }
            ]
          }
        ]
      });
      
      if (!user) {
        return next(AppError.notFound('Utente non trovato'));
      }
      
      const abilityService = require('../../services/abilityService');
      const ability = await abilityService.defineAbilityFor(user);
      const rules = ability.rules;
      
      res.json({
        status: 'success',
        data: {
          user: {
            id: user.id,
            name: user.name,
            username: user.username
          },
          roleAbilities: user.roles.flatMap(role => 
            role.abilities.map(ability => ({
              action: ability.action,
              subject: ability.subject,
              conditions: ability.conditions,
              fields: ability.fields,
              inverted: ability.inverted,
              priority: ability.priority,
              source: `Role: ${role.name}`,
              priority_type: 'role'
            }))
          ),
          userAbilities: user.userAbilities.map(ability => ({
            action: ability.action,
            subject: ability.subject,
            conditions: ability.conditions,
            fields: ability.fields,
            inverted: ability.inverted,
            reason: ability.reason,
            expires_at: ability.expires_at,
            priority: ability.priority,
            role_context: ability.roleContext ? {
              id: ability.roleContext.id,
              name: ability.roleContext.name
            } : null,
            source: ability.role_context_id ? `Individual (${ability.roleContext?.name})` : 'Individual (Global)',
            priority_type: ability.role_context_id ? 'individual_role' : 'individual_global'
          })),
          effectiveRules: rules,
          context: {
            active_role_id: user.active_role_id || null,
            total_rules: rules.length,
            abilities_breakdown: {
              from_roles: user.roles.reduce((sum, role) => sum + (role.abilities?.length || 0), 0),
              individual_global: user.userAbilities.filter(a => !a.role_context_id).length,
              individual_role_specific: user.userAbilities.filter(a => a.role_context_id).length
            }
          }
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante il recupero dei permessi effettivi');
      next(error);
    }
  }

  /**
   * NUOVO: Ottiene un riassunto dei permessi raggruppati per ruolo di contesto
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getUserAbilitiesByRoleContext(req, res, next) {
    try {
      const { userId } = req.params;
      
      const user = await User.findOne({
        where: {
          id: userId,
          tenant_id: req.tenantId
        },
        include: [
          {
            model: sequelize.models.Role,
            as: 'roles',
            attributes: ['id', 'name', 'description']
          }
        ]
      });
      
      if (!user) {
        return next(AppError.notFound('Utente non trovato'));
      }
      
      const userAbilities = await UserAbility.findAll({
        where: {
          user_id: userId,
          tenant_id: req.tenantId
        },
        include: [
          {
            model: sequelize.models.Role,
            as: 'roleContext',
            attributes: ['id', 'name', 'description']
          }
        ],
        order: [
          ['priority', 'DESC'],
          ['created_at', 'DESC']
        ]
      });
      
      // Raggruppa per ruolo di contesto
      const abilitiesByContext = {
        global: userAbilities.filter(a => !a.role_context_id),
        by_role: {}
      };
      
      user.roles.forEach(role => {
        const roleAbilities = userAbilities.filter(a => a.role_context_id === role.id);
        if (roleAbilities.length > 0) {
          abilitiesByContext.by_role[role.id] = {
            role: {
              id: role.id,
              name: role.name,
              description: role.description
            },
            abilities: roleAbilities,
            stats: {
              total: roleAbilities.length,
              active: roleAbilities.filter(a => !a.isExpired()).length,
              expired: roleAbilities.filter(a => a.isExpired()).length,
              by_action: this.groupAbilitiesByAction(roleAbilities),
              highest_priority: Math.max(...roleAbilities.map(a => a.priority), 0)
            }
          };
        }
      });
      
      const globalStats = {
        total: abilitiesByContext.global.length,
        active: abilitiesByContext.global.filter(a => !a.isExpired()).length,
        expired: abilitiesByContext.global.filter(a => a.isExpired()).length,
        by_action: this.groupAbilitiesByAction(abilitiesByContext.global),
        highest_priority: Math.max(...abilitiesByContext.global.map(a => a.priority), 0)
      };
      
      res.json({
        status: 'success',
        data: {
          user: {
            id: user.id,
            name: user.name,
            username: user.username
          },
          abilities_by_context: abilitiesByContext,
          summary: {
            total_abilities: userAbilities.length,
            global_abilities: abilitiesByContext.global.length,
            role_specific_abilities: userAbilities.length - abilitiesByContext.global.length,
            roles_with_abilities: Object.keys(abilitiesByContext.by_role).length,
            global_stats: globalStats
          }
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante il recupero dei permessi per contesto ruolo');
      next(error);
    }
  }

  /**
   * Helper per raggruppare abilities per azione
   * @param {Array} abilities - Array di abilities
   * @returns {Object} - Oggetto con conteggi per azione
   * @private
   */
  groupAbilitiesByAction(abilities) {
    const grouped = {};
    abilities.forEach(ability => {
      const action = ability.action;
      if (!grouped[action]) {
        grouped[action] = 0;
      }
      grouped[action]++;
    });
    return grouped;
  }
}

module.exports = new UserAbilityController();