'use strict';
// Load environment variables
require('dotenv').config();

const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { User } = require('../models');
const { createLogger } = require('../utils/logger');
const logger = createLogger('config:passport');

/**
 * Configurazione Passport.js con strategia JWT e supporto multi-ruolo
 * @param {Object} app - Express application
 */
module.exports = (app) => {
  // Configurazione delle opzioni per la strategia JWT
  const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    algorithms: ['HS256'],
    ignoreExpiration: false
  };

  logger.info(`JWT_SECRET usato da passport: ${process.env.JWT_SECRET}`);
  
  // Definizione della strategia JWT con supporto multi-ruolo
  const jwtStrategy = new JwtStrategy(jwtOptions, async (payload, done) => {
    try {
      logger.debug(`Verifica token JWT per user ID: ${payload.sub}, ruolo attivo: ${payload.active_role_id || 'non specificato'}`);

      // Cerca l'utente nel database
      const user = await User.findByPk(payload.sub, {
        include: [{
          association: 'roles',
          include: ['abilities']
        }]
      });

      // Se l'utente non esiste o non è attivo, rifiuta l'autenticazione
      if (!user || !user.active) {
        logger.warn(`Autenticazione fallita: utente ${payload.sub} non trovato o non attivo`);
        return done(null, false, { message: 'Utente non trovato o non attivo' });
      }

      // Se il token è stato emesso prima dell'ultimo aggiornamento della password, rifiuta
      if (payload.iat && user.updated_at && payload.iat < Math.floor(new Date(user.updated_at).getTime() / 1000)) {
        logger.warn(`Autenticazione fallita: token emesso prima dell'ultimo aggiornamento utente`);
        return done(null, false, { message: 'Token non più valido, necessario nuovo login' });
      }

      // Verifica che il tenant dell'utente sia lo stesso di quello specificato nel token
      if (payload.tenant_id && user.tenant_id && payload.tenant_id !== user.tenant_id) {
        logger.warn(`Autenticazione fallita: token emesso per un altro tenant`);
        return done(null, false, { message: 'Token non valido per questo tenant' });
      }

      // NUOVO: Validazione ruolo attivo se specificato nel token
      if (payload.active_role_id) {
        // Verifica che il ruolo attivo sia ancora valido per l'utente
        const hasActiveRole = user.roles && user.roles.some(role => 
          role.id === payload.active_role_id && role.active !== false
        );

        if (!hasActiveRole) {
          logger.warn(`Autenticazione fallita: ruolo attivo ${payload.active_role_id} non più valido per utente ${user.username}`);
          return done(null, false, { 
            message: 'Ruolo non più valido, necessario nuovo login',
            code: 'INVALID_ROLE' // Codice specifico per gestione frontend
          });
        }

        // Aggiungi il ruolo attivo all'oggetto user per facilitare l'accesso
        user.active_role_id = payload.active_role_id;
        user.active_role_name = payload.active_role_name;
        
        logger.debug(`Ruolo attivo validato: ${payload.active_role_name} (${payload.active_role_id})`);
      } else {
        // Token legacy senza ruolo attivo - comportamento di fallback
        logger.debug(`Token legacy senza ruolo attivo per utente ${user.username}`);
        user.active_role_id = null;
        user.active_role_name = null;
      }

      // Autenticazione riuscita, passa l'utente
      logger.debug(`Autenticazione riuscita per l'utente ${user.username} con ruolo ${user.active_role_name || 'legacy'}`);
      return done(null, user);
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la verifica del token');
      return done(error);
    }
  });

  // Inizializza Passport e usa la strategia JWT
  app.use(passport.initialize());
  passport.use('jwt', jwtStrategy);

  logger.info('Passport configurato con strategia JWT e supporto multi-ruolo');
};