'use strict';

/**
 * Configurazione delle rotte API
 */
const express = require('express');
const router = express.Router();

// Importa le rotte
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const roleRoutes = require('./roleRoutes');

// Middleware per il controllo della salute dell'API
router.get('/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Configura le rotte - tenantMiddleware viene già applicato in app.js
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);

// Gestione 404 per rotte non trovate
router.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.originalUrl}`
  });
});

module.exports = router;