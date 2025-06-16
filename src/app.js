// Load environment variables
require('dotenv').config();

// Import required packages
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const passport = require('passport');
const configurePassport = require('./config/passport');
const dbContextMiddleware = require('./middleware/db-context');
const { errorHandler } = require('./middleware/errorHandler');
const { createResponseLogger } = require('./utils/logger');
const tenantMiddleware = require('./middleware/tenantMiddleware');
const api = require('./api');

// Initialize Express app
const app = express();

// Configure security and CORS
function configureSecurity(app) {
  app.use(helmet()); // Security headers
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID']
  })); // Enable CORS with expanded options
}

// Configure middleware
function configureMiddleware(app) {
  app.use(express.json()); // Parse JSON bodies
  app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
  app.use(createResponseLogger()); // Response logger
}

// Configure tenant and DB context middleware
function configureTenantAndDbContext(app) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next();

    tenantMiddleware(req, res, (err) => {
      if (err) return next(err);
      dbContextMiddleware(req, res, next);
    });
  });

  app.use((req, res, next) => {
    if (req.tenantId) {
      req.sequelizeOptions = { tenantId: req.tenantId };
    }
    next();
  });
}

// Configure routes
function configureRoutes(app) {
  const apiPrefix = process.env.API_PREFIX || '/api';

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'success',
      message: 'Server is up and running',
      timestamp: new Date().toISOString(),
    });
  });

  // Central API routes
  app.use(apiPrefix, api.routes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      status: 'error',
      message: `Route not found: ${req.originalUrl}`,
    });
  });
}

// Initialize app
function initializeConfigExpressApp(app) {
  configurePassport(app);
  configureSecurity(app);
  configureMiddleware(app);
  configureTenantAndDbContext(app);
  configureRoutes(app);
  app.use(errorHandler); // Error handler middleware
}

// Run initialization
initializeConfigExpressApp(app);

module.exports = app;