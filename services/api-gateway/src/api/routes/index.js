'use strict';

const express = require('express');
const router = express.Router();

// ===== ROUTES ESISTENTI =====
console.log('[api/routes] - Loading authRoutes...');
const authRoutes = require('./authRoutes');
console.log('[api/routes] - Loading userRoutes...');
const userRoutes = require('./userRoutes');
console.log('[api/routes] - Loading roleRoutes...');
const roleRoutes = require('./roleRoutes');
console.log('[api/routes] - Loading userAbilityRoutes...');
const userAbilityRoutes = require('./userAbilityRoutes');

// ===== NUOVE ROUTES REAL ESTATE (Task 1.5) =====
console.log('[api/routes] - Loading searchResultRoutes...');
const searchResultRoutes = require('./searchResultRoutes');
console.log('[api/routes] - Loading savedSearchRoutes...');
const savedSearchRoutes = require('./savedSearchRoutes');
console.log('[api/routes] - Loading searchExecutionRoutes...');
const searchExecutionRoutes = require('./searchExecutionRoutes');

/**
 * Configurazione routes principali dell'API
 * Aggiornato con le nuove routes Real Estate per Task 1.5
 */

try {
  console.log('[DEBUG] Registering /auth...');
  router.use('/auth', authRoutes);
  console.log('[DEBUG] ✅ /auth registered OK');

  console.log('[DEBUG] Registering /users...');
  router.use('/users', userRoutes);
  console.log('[DEBUG] ✅ /users registered OK');

  console.log('[DEBUG] Registering /roles...');
  router.use('/roles', roleRoutes);
  console.log('[DEBUG] ✅ /roles registered OK');

  console.log('[DEBUG] Registering /user-abilities...');
  router.use('/user-abilities', userAbilityRoutes);
  console.log('[DEBUG] ✅ /user-abilities registered OK');

  // ===== NUOVE ROUTES REAL ESTATE =====
  console.log('[DEBUG] Registering /search-results...');
  router.use('/search-results', searchResultRoutes);
  console.log('[DEBUG] ✅ /search-results registered OK');

  console.log('[DEBUG] Registering /saved-searches...');
  router.use('/saved-searches', savedSearchRoutes);
  console.log('[DEBUG] ✅ /saved-searches registered OK');

  console.log('[DEBUG] Registering /search-executions...');
  router.use('/search-executions', searchExecutionRoutes);
  console.log('[DEBUG] ✅ /search-executions registered OK');

  // ===== HEALTH CHECK E DOCS =====
  console.log('[DEBUG] Adding health route...');
  router.get('/health', (req, res) => {
    res.json({
      status: 'success',
      message: 'API Gateway is healthy',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0'
    });
  });
  console.log('[DEBUG] ✅ /health route added OK');

  console.log('[DEBUG] Adding root route...');
  router.get('/', (req, res) => {
    res.json({
      status: 'success',
      message: 'Real Estate Scraper API Gateway',
      version: process.env.APP_VERSION || '1.0.0'
    });
  });
  console.log('[DEBUG] ✅ / route added OK');


} catch (error) {
  console.error('[DEBUG] ❌ Route registration ERROR:', error.message);
  throw error;
}

console.log('[DEBUG] All routes registered successfully!');
module.exports = router;