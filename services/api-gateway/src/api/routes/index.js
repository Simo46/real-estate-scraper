'use strict';

const express = require('express');
const router = express.Router();

/**
 * Routes Index - Combina tutte le routes in un singolo router
 */

console.log('[api/routes] - Loading authRoutes...');
const authRoutes = require('./authRoutes');
console.log('[api/routes] - Loading userRoutes...');
const userRoutes = require('./userRoutes');
console.log('[api/routes] - Loading roleRoutes...');
const roleRoutes = require('./roleRoutes');
console.log('[api/routes] - Loading userAbilityRoutes...');
const userAbilityRoutes = require('./userAbilityRoutes');

// Real Estate Routes - with error handling
console.log('[api/routes] - Loading searchResultRoutes...');
let searchResultRoutes = null;
try {
  searchResultRoutes = require('./searchResultRoutes');
  console.log('[api/routes] - ✅ searchResultRoutes loaded');
} catch (error) {
  console.error('[api/routes] - ❌ searchResultRoutes failed:', error.message);
}

console.log('[api/routes] - Loading savedSearchRoutes...');
let savedSearchRoutes = null;
try {
  savedSearchRoutes = require('./savedSearchRoutes');
  console.log('[api/routes] - ✅ savedSearchRoutes loaded');
} catch (error) {
  console.error('[api/routes] - ❌ savedSearchRoutes failed:', error.message);
}

console.log('[api/routes] - Loading searchExecutionRoutes...');
let searchExecutionRoutes = null;
try {
  searchExecutionRoutes = require('./searchExecutionRoutes');
  console.log('[api/routes] - ✅ searchExecutionRoutes loaded');
} catch (error) {
  console.error('[api/routes] - ❌ searchExecutionRoutes failed:', error.message);
}

// Registra tutte le routes
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

// Real Estate Routes - only if loaded successfully
if (searchResultRoutes) {
  console.log('[DEBUG] Registering /search-results...');
  router.use('/search-results', searchResultRoutes);
  console.log('[DEBUG] ✅ /search-results registered OK');
} else {
  console.log('[DEBUG] ⚠️ /search-results skipped (not loaded)');
}

if (savedSearchRoutes) {
  console.log('[DEBUG] Registering /saved-searches...');
  router.use('/saved-searches', savedSearchRoutes);
  console.log('[DEBUG] ✅ /saved-searches registered OK');
} else {
  console.log('[DEBUG] ⚠️ /saved-searches skipped (not loaded)');
}

if (searchExecutionRoutes) {
  console.log('[DEBUG] Registering /search-executions...');
  router.use('/search-executions', searchExecutionRoutes);
  console.log('[DEBUG] ✅ /search-executions registered OK');
} else {
  console.log('[DEBUG] ⚠️ /search-executions skipped (not loaded)');
}

// Health route
console.log('[DEBUG] Adding health route...');
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API routes are working',
    timestamp: new Date().toISOString(),
    routes: {
      auth: '/auth',
      users: '/users',
      roles: '/roles',
      userAbilities: '/user-abilities',
      searchResults: searchResultRoutes ? '/search-results' : null,
      savedSearches: savedSearchRoutes ? '/saved-searches' : null,
      searchExecutions: searchExecutionRoutes ? '/search-executions' : null
    }
  });
});
console.log('[DEBUG] ✅ /health route added OK');

// Root route
console.log('[DEBUG] Adding root route...');
router.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Real Estate API Gateway',
    version: '1.0.0',
    endpoints: [
      '/auth',
      '/users', 
      '/roles',
      '/user-abilities',
      searchResultRoutes ? '/search-results' : null,
      savedSearchRoutes ? '/saved-searches' : null,
      searchExecutionRoutes ? '/search-executions' : null
    ].filter(Boolean)
  });
});
console.log('[DEBUG] ✅ / route added OK');

console.log('[DEBUG] All routes registered successfully!');

module.exports = router;