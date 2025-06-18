const { testConnection } = require('./database');
const { connectRedis } = require('./redis');
const { createLogger } = require('../utils/logger');

// Initialize logger
const logger = createLogger('init');

/**
 * Initialize all application services
 */
const initializeDbAndRedis = async () => {
  logger.info('Initializing application services...');
  
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    logger.warn('Application started with database connection issues');
  }
  
  // Connect to Redis
  const redisConnected = await connectRedis();
  if (!redisConnected) {
    logger.warn('Application started with Redis connection issues');
  }
  
  logger.info('Application services initialized');
};

module.exports = {
  initializeDbAndRedis,
};
