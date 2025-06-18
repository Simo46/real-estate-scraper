'use strict';

const { createLogger } = require('../utils/logger');
const { AppError } = require('./errorHandler');
const logger = createLogger('middleware:rate-limiting');

/**
 * Middleware di rate limiting specifico per autenticazione multi-ruolo
 * Utilizza una strategia in-memory semplice, ma può essere esteso con Redis
 */
class AuthRateLimiterMiddleware {
  constructor() {
    // Store in-memory per il rate limiting (in produzione usare Redis)
    this.attempts = new Map();
    this.preAuthTokens = new Map();
    this.roleSwitches = new Map();
    
    // Cleanup automatico ogni 15 minuti
    setInterval(() => this.cleanup(), 15 * 60 * 1000);
  }

  /**
   * Rate limiting per tentativi di login
   * 5 tentativi per IP ogni 15 minuti
   */
  loginAttempts() {
    return (req, res, next) => {
      const key = `login:${req.ip}`;
      const now = Date.now();
      const windowMs = 15 * 60 * 1000; // 15 minuti
      const maxAttempts = 5;

      // Ottieni tentativi esistenti
      const attempts = this.attempts.get(key) || [];
      
      // Filtra tentativi dentro la finestra temporale
      const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);
      
      // Verifica limite
      if (recentAttempts.length >= maxAttempts) {
        logger.warn(`Rate limit superato per login da IP: ${req.ip}`);
        return next(AppError.authentication(
          'Troppi tentativi di login. Riprova tra 15 minuti.',
          { retryAfter: Math.ceil((recentAttempts[0] + windowMs - now) / 1000) }
        ));
      }
      
      // Registra il tentativo se il login fallisce
      const originalNext = next;
      next = (error) => {
        if (error && error.statusCode === 401) {
          recentAttempts.push(now);
          this.attempts.set(key, recentAttempts);
          logger.debug(`Registrato tentativo fallito di login per IP: ${req.ip} (${recentAttempts.length}/${maxAttempts})`);
        }
        originalNext(error);
      };
      
      next();
    };
  }

  /**
   * Rate limiting per conferma ruolo con preAuthToken
   * 10 tentativi per token
   */
  confirmRoleAttempts() {
    return (req, res, next) => {
      const { preAuthToken } = req.body;
      
      if (!preAuthToken) {
        return next();
      }

      const key = `confirm:${preAuthToken.substring(0, 20)}`; // Usa prime 20 char del token
      const now = Date.now();
      const windowMs = 2 * 60 * 1000; // 2 minuti (durata del preAuth token)
      const maxAttempts = 10;

      // Ottieni tentativi esistenti
      const attempts = this.preAuthTokens.get(key) || [];
      
      // Filtra tentativi dentro la finestra temporale
      const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);
      
      // Verifica limite
      if (recentAttempts.length >= maxAttempts) {
        logger.warn(`Rate limit superato per conferma ruolo con token: ${key}`);
        return next(AppError.authentication(
          'Troppi tentativi di conferma ruolo. Token invalidato.',
          { reason: 'rate_limit_exceeded' }
        ));
      }
      
      // Registra il tentativo se la conferma fallisce
      const originalNext = next;
      next = (error) => {
        if (error && (error.statusCode === 401 || error.statusCode === 403)) {
          recentAttempts.push(now);
          this.preAuthTokens.set(key, recentAttempts);
          logger.debug(`Registrato tentativo fallito di conferma ruolo per token: ${key} (${recentAttempts.length}/${maxAttempts})`);
        }
        originalNext(error);
      };
      
      next();
    };
  }

  /**
   * Rate limiting per cambio ruolo durante sessione
   * 20 switch per utente ogni ora
   */
  roleSwitchAttempts() {
    return (req, res, next) => {
      if (!req.user || !req.user.id) {
        return next();
      }

      const key = `switch:${req.user.id}`;
      const now = Date.now();
      const windowMs = 60 * 60 * 1000; // 1 ora
      const maxSwitches = 20;

      // Ottieni switch esistenti
      const switches = this.roleSwitches.get(key) || [];
      
      // Filtra switch dentro la finestra temporale
      const recentSwitches = switches.filter(timestamp => now - timestamp < windowMs);
      
      // Verifica limite
      if (recentSwitches.length >= maxSwitches) {
        logger.warn(`Rate limit superato per switch ruolo utente: ${req.user.username}`);
        return next(AppError.authorization(
          'Troppi cambi di ruolo. Riprova tra un\'ora.',
          { retryAfter: Math.ceil((recentSwitches[0] + windowMs - now) / 1000) }
        ));
      }
      
      // Registra il switch (sia successo che fallimento)
      const originalNext = next;
      next = (error) => {
        // Registra sempre il tentativo per evitare spam
        recentSwitches.push(now);
        this.roleSwitches.set(key, recentSwitches);
        logger.debug(`Registrato switch ruolo per utente: ${req.user.username} (${recentSwitches.length}/${maxSwitches})`);
        originalNext(error);
      };
      
      next();
    };
  }

  /**
   * Rate limiting generico per endpoint di autenticazione
   * 60 richieste per IP ogni minuto
   */
  generalAuthLimit() {
    return (req, res, next) => {
      const key = `auth:${req.ip}`;
      const now = Date.now();
      const windowMs = 60 * 1000; // 1 minuto
      const maxRequests = 60;

      // Ottieni richieste esistenti
      const requests = this.attempts.get(key) || [];
      
      // Filtra richieste dentro la finestra temporale
      const recentRequests = requests.filter(timestamp => now - timestamp < windowMs);
      
      // Verifica limite
      if (recentRequests.length >= maxRequests) {
        logger.warn(`Rate limit generale superato per IP: ${req.ip}`);
        return next(AppError.authentication(
          'Troppe richieste. Riprova tra un minuto.',
          { retryAfter: 60 }
        ));
      }
      
      // Registra la richiesta
      recentRequests.push(now);
      this.attempts.set(key, recentRequests);
      
      next();
    };
  }

  /**
   * Cleanup delle entries scadute
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    // Cleanup tentativi di login (finestra 15 minuti)
    for (const [key, attempts] of this.attempts.entries()) {
      const validAttempts = attempts.filter(timestamp => now - timestamp < 15 * 60 * 1000);
      if (validAttempts.length === 0) {
        this.attempts.delete(key);
        cleaned++;
      } else {
        this.attempts.set(key, validAttempts);
      }
    }

    // Cleanup tentativi preAuth (finestra 2 minuti)
    for (const [key, attempts] of this.preAuthTokens.entries()) {
      const validAttempts = attempts.filter(timestamp => now - timestamp < 2 * 60 * 1000);
      if (validAttempts.length === 0) {
        this.preAuthTokens.delete(key);
        cleaned++;
      } else {
        this.preAuthTokens.set(key, validAttempts);
      }
    }

    // Cleanup switch ruoli (finestra 1 ora)
    for (const [key, switches] of this.roleSwitches.entries()) {
      const validSwitches = switches.filter(timestamp => now - timestamp < 60 * 60 * 1000);
      if (validSwitches.length === 0) {
        this.roleSwitches.delete(key);
        cleaned++;
      } else {
        this.roleSwitches.set(key, validSwitches);
      }
    }

    if (cleaned > 0) {
      logger.debug(`Rate limiter cleanup: rimossi ${cleaned} entries scaduti`);
    }
  }

  /**
   * Reset manuale per un IP o utente (per amministratori)
   */
  reset(identifier, type = 'ip') {
    let count = 0;
    const patterns = {
      ip: [`login:${identifier}`, `auth:${identifier}`],
      user: [`switch:${identifier}`],
      token: [`confirm:${identifier}`]
    };

    const keysToRemove = patterns[type] || [];
    
    keysToRemove.forEach(key => {
      if (this.attempts.has(key) || this.preAuthTokens.has(key) || this.roleSwitches.has(key)) {
        this.attempts.delete(key);
        this.preAuthTokens.delete(key);
        this.roleSwitches.delete(key);
        count++;
      }
    });

    logger.info(`Rate limiter reset per ${type}:${identifier} - ${count} entries rimossi`);
    return count;
  }

  /**
   * Statistiche del rate limiter
   */
  getStats() {
    return {
      loginAttempts: this.attempts.size,
      preAuthAttempts: this.preAuthTokens.size,
      roleSwitches: this.roleSwitches.size,
      totalEntries: this.attempts.size + this.preAuthTokens.size + this.roleSwitches.size
    };
  }
}

// Crea istanza singleton
const authRateLimiterMiddleware = new AuthRateLimiterMiddleware();

module.exports = {
  authRateLimiterMiddleware,
  loginRateLimit: authRateLimiterMiddleware.loginAttempts.bind(authRateLimiterMiddleware),
  confirmRoleRateLimit: authRateLimiterMiddleware.confirmRoleAttempts.bind(authRateLimiterMiddleware),
  roleSwitchRateLimit: authRateLimiterMiddleware.roleSwitchAttempts.bind(authRateLimiterMiddleware),
  generalAuthRateLimit: authRateLimiterMiddleware.generalAuthLimit.bind(authRateLimiterMiddleware)
};