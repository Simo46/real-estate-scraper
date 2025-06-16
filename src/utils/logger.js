const pino = require('pino');
const pinoHttp = require('pino-http');

// Get environment variables
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Create a logger instance with the given label
 * @param {string} label - The label for the logger
 * @returns {object} - The configured logger instance
 */
const createLogger = (label) => {
  return pino({
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    base: { service: 'au-to-be-node', label },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            levelFirst: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
  });
};

/**
 * Create HTTP logger middleware
 * Nota: Questo è ancora utile per il debug ma non lo useremo per il logging delle risposte
 * @returns {function} Express middleware
 */
const createHttpLogger = () => {
  return pinoHttp({
    logger: createLogger('http-request'),
    autoLogging: {
      ignore: (req) => req.url.includes('/api/health')
    },
    // Disabilitiamo il logging automatico delle risposte
    customSuccessMessage: () => false,
    customErrorMessage: () => false,
    customReceivedMessage: (req) => `Ricevuta richiesta: ${req.method} ${req.url}`
  });
};

/**
 * Create a response logger middleware
 * Questo middleware registra le risposte dopo che tutti gli altri middleware sono stati applicati
 * @returns {function} Express middleware
 */
const createResponseLogger = () => {
  const logger = createLogger('http-response');
  
  return (req, res, next) => {
    // Save original end method
    const originalEnd = res.end;
    const startTime = Date.now();
    
    // Override end method
    res.end = function(chunk, encoding) {
      // Restore original end method
      res.end = originalEnd;
      
      // Call original end method
      res.end(chunk, encoding);
      
      // Log response with appropriate level
      const level = res.statusCode >= 500 ? 'error' : 
                   res.statusCode >= 400 ? 'warn' : 'info';
      
      logger[level]({
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode: res.statusCode,
        tenantId: req.tenantId || 'no-tenant',
        responseTime: Date.now() - startTime,
        userAgent: req.headers['user-agent']
      }, `${req.method} ${req.originalUrl || req.url} ${res.statusCode}`);
    };
    
    next();
  };
};

module.exports = {
  createLogger,
  createHttpLogger,
  createResponseLogger
};