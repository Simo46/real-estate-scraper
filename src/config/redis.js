// Load environment variables
require('dotenv').config();

const { createClient } = require('redis');
const { createLogger } = require('../utils/logger');

// Initialize logger
const logger = createLogger('redis');

// Redis configuration
const config = {
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || '',
};

// Create Redis client
const redisClient = createClient({
  url: `redis://${config.password ? `:${config.password}@` : ''}${config.host}:${config.port}`,
});

// Connect to Redis
const connectRedis = async () => {
  try {
    await redisClient.connect();
    logger.info('Redis client connected successfully');
    return true;
  } catch (error) {
    logger.error('Redis client connection error:', error);
    return false;
  }
};

// Redis error handler
redisClient.on('error', (err) => {
  logger.error('Redis client error:', err);
});

/**
 * Cache middleware for API responses
 * @param {number} duration - Cache duration in seconds
 * @returns {function} - Express middleware
 */
const cacheMiddleware = (duration) => {
  return async (req, res, next) => {
    // Skip caching if Redis is not connected
    if (!redisClient.isReady) {
      return next();
    }

    const key = `cache:${req.originalUrl}`;

    try {
      const cachedData = await redisClient.get(key);
      
      if (cachedData) {
        const data = JSON.parse(cachedData);
        logger.debug(`Cache hit for ${key}`);
        return res.status(200).json(data);
      }

      // Store the original send method
      const originalSend = res.send;

      // Override the send method to cache the response
      res.send = function (body) {
        // Only cache successful responses
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            redisClient.setEx(key, duration, body);
            logger.debug(`Cache set for ${key}`);
          } catch (error) {
            logger.error(`Cache set error for ${key}:`, error);
          }
        }

        // Call the original send method
        originalSend.call(this, body);
      };

      next();
    } catch (error) {
      logger.error(`Cache middleware error for ${key}:`, error);
      next();
    }
  };
};

/**
 * Clear cache for a specific key pattern
 * @param {string} pattern - Key pattern to clear
 */
const clearCache = async (pattern) => {
  if (!redisClient.isReady) {
    logger.warn('Redis client not connected, skipping cache clear');
    return;
  }

  try {
    const keys = await redisClient.keys(`cache:${pattern}`);
    
    if (keys.length > 0) {
      await Promise.all(keys.map((key) => redisClient.del(key)));
      logger.info(`Cleared ${keys.length} cache keys matching ${pattern}`);
    }
  } catch (error) {
    logger.error(`Clear cache error for ${pattern}:`, error);
  }
};

module.exports = {
  redisClient,
  connectRedis,
  cacheMiddleware,
  clearCache,
};
