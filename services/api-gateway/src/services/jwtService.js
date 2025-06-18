'use strict';
// Load environment variables
require('dotenv').config();

const jwt = require('jsonwebtoken');
const { createLogger } = require('../utils/logger');
const logger = createLogger('services:jwt');

/**
 * Servizio per la gestione dei token JWT con supporto multi-ruolo
 */
class JwtService {
  constructor() {
    this.accessSecret = process.env.JWT_SECRET || 'your-access-secret-key';
    this.refreshSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
    this.preAuthSecret = process.env.JWT_PRE_AUTH_SECRET || 'your-pre-auth-secret-key';
    this.accessExpiresIn = process.env.JWT_EXPIRES_IN || '15m'; // breve durata
    this.refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d'; // lunga durata
    this.preAuthExpiresIn = process.env.JWT_PRE_AUTH_EXPIRES_IN || '2m'; // brevissima durata per sicurezza maggiore
    this.algorithm = 'HS256';
    logger.info(`JWT_SECRET usato da jwtService: ${this.accessSecret}`);
  }

  /**
   * Genera access e refresh token con supporto per ruolo attivo
   * @param {Object} user - Utente per cui generare i token
   * @param {string} activeRoleId - ID del ruolo attivo
   * @param {Object} additionalClaims - Claim aggiuntivi
   * @returns {Object} - accessToken, refreshToken e data di scadenza
   */
  generateTokens(user, activeRoleId = null, additionalClaims = {}) {
    try {
      const now = Math.floor(Date.now() / 1000);
      // Genera un ID univoco per il refresh token (JWT ID)
      const refreshTokenId = require('crypto').randomUUID();

      // Trova il ruolo attivo per includere il nome
      let activeRoleName = null;
      if (activeRoleId && user.roles) {
        const activeRole = user.roles.find(role => role.id === activeRoleId);
        activeRoleName = activeRole ? activeRole.name : null;
      }

      // Payload per access token con supporto multi-ruolo
      const accessPayload = {
        sub: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        tenant_id: user.tenant_id,
        filiale_id: user.filiale_id,
        active_role_id: activeRoleId, // NUOVO: ruolo attivo
        active_role_name: activeRoleName, // NUOVO: nome ruolo attivo
        iat: now,
        ...additionalClaims
      };

      const accessToken = jwt.sign(accessPayload, this.accessSecret, {
        expiresIn: this.accessExpiresIn,
        algorithm: this.algorithm
      });

      // Payload per refresh token con ruolo attivo
      const refreshPayload = {
        sub: user.id,
        type: 'refresh',
        jti: refreshTokenId,
        active_role_id: activeRoleId, // NUOVO: mantieni ruolo nel refresh
        iat: now
      };

      const refreshToken = jwt.sign(refreshPayload, this.refreshSecret, {
        expiresIn: this.refreshExpiresIn,
        algorithm: this.algorithm
      });

      logger.debug(`Token generati per l'utente ${user.username} con ruolo ${activeRoleName || 'non specificato'}`);

      return {
        accessToken,
        refreshToken,
        refreshTokenId,
        expires: this.getTokenExpiration(this.accessExpiresIn)
      };
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la generazione dei token');
      throw error;
    }
  }

  /**
   * Genera un token di pre-autenticazione per la selezione ruolo
   * @param {Object} user - Utente autenticato
   * @param {Array} availableRoleIds - Array di ID dei ruoli disponibili
   * @returns {Object} - preAuthToken e scadenza
   */
  generatePreAuthToken(user, availableRoleIds) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const tokenId = require('crypto').randomUUID(); // Per prevenire riutilizzo

      const preAuthPayload = {
        type: 'pre_auth', // Tipo specifico per identificare il token
        sub: user.id,
        tenant_id: user.tenant_id,
        available_role_ids: availableRoleIds, // Ruoli tra cui l'utente può scegliere
        jti: tokenId, // JWT ID per tracciare e prevenire riutilizzo
        iat: now
      };

      const preAuthToken = jwt.sign(preAuthPayload, this.preAuthSecret, {
        expiresIn: this.preAuthExpiresIn,
        algorithm: this.algorithm
      });

      logger.debug(`Token pre-auth generato per l'utente ${user.username} con ${availableRoleIds.length} ruoli disponibili`);

      return {
        preAuthToken,
        tokenId,
        expires: this.getTokenExpiration(this.preAuthExpiresIn)
      };
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la generazione del token pre-auth');
      throw error;
    }
  }

  /**
   * Verifica un access token
   * @param {string} token - Access token da verificare
   * @returns {Object} - Payload decodificato
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.accessSecret, { algorithms: [this.algorithm] });
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la verifica del token');
      throw error;
    }
  }

  /**
   * Verifica un refresh token
   * @param {string} refreshToken - Refresh token da verificare
   * @returns {Object} - Payload decodificato
   */
  verifyRefreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.refreshSecret, { algorithms: [this.algorithm] });

      if (decoded.type !== 'refresh') {
        throw new Error('Il token non è un refresh token valido');
      }

      return decoded;
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la verifica del refresh token');
      throw error;
    }
  }

  /**
   * Verifica un token di pre-autenticazione
   * @param {string} preAuthToken - Token pre-auth da verificare
   * @returns {Object} - Payload decodificato
   */
  verifyPreAuthToken(preAuthToken) {
    try {
      const decoded = jwt.verify(preAuthToken, this.preAuthSecret, { algorithms: [this.algorithm] });

      if (decoded.type !== 'pre_auth') {
        throw new Error('Il token non è un token pre-auth valido');
      }

      // Verifica che il token non sia scaduto (controllo aggiuntivo)
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp < now) {
        throw new Error('Token pre-auth scaduto');
      }

      logger.debug(`Token pre-auth verificato per utente ${decoded.sub}`);
      return decoded;
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la verifica del token pre-auth');
      throw error;
    }
  }

  /**
   * Decodifica un token senza verifica (per debugging)
   * @param {string} token - Token da decodificare
   * @returns {Object} - Payload decodificato
   */
  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.error({ err: error }, 'Errore durante la decodifica del token');
      return null;
    }
  }

  /**
   * Calcola la data di scadenza di un token
   * @param {string} expiresIn - Durata del token (es. '15m', '1d')
   * @returns {Date} - Data di scadenza
   */
  getTokenExpiration(expiresIn) {
    let seconds;
    const match = expiresIn.match(/^(\d+)([smhdw])$/);

    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      switch (unit) {
        case 's': seconds = value; break;
        case 'm': seconds = value * 60; break;
        case 'h': seconds = value * 3600; break;
        case 'd': seconds = value * 86400; break;
        case 'w': seconds = value * 604800; break;
        default: seconds = 0;
      }
    } else {
      seconds = parseInt(expiresIn);
    }

    const expiration = new Date();
    expiration.setSeconds(expiration.getSeconds() + seconds);
    return expiration;
  }

  /**
   * Estrae il ruolo attivo da un token (senza verifica completa)
   * Utile per logging e debugging
   * @param {string} token - Token da cui estrarre il ruolo
   * @returns {string|null} - ID del ruolo attivo o null
   */
  getActiveRoleFromToken(token) {
    try {
      const decoded = this.decodeToken(token);
      return decoded?.active_role_id || null;
    } catch (error) {
      logger.debug('Impossibile estrarre ruolo attivo dal token');
      return null;
    }
  }
}

module.exports = new JwtService();