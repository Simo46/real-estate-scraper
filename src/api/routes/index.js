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
const filialeRoutes = require('./filialeRoutes');
const pianoRoutes = require('./pianoRoutes'); 
const localeRoutes = require('./localeRoutes');
const edificioRoutes = require('./edificioRoutes');
const assetRoutes = require('./assetRoutes');
const attrezzaturaRoutes = require('./attrezzaturaRoutes');
const strumentoRoutes = require('./strumentoRoutes');
const impiantoRoutes = require('./impiantoRoutes');

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
router.use('/filiali', filialeRoutes);
router.use('/piani', pianoRoutes); 
router.use('/locali', localeRoutes); 
router.use('/edifici', edificioRoutes);
router.use('/assets', assetRoutes);
router.use('/attrezzature', attrezzaturaRoutes);
router.use('/strumenti', strumentoRoutes);
router.use('/impianti', impiantoRoutes);

// Gestione 404 per rotte non trovate
router.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.originalUrl}`
  });
});

module.exports = router;