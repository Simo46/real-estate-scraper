// Load environment variables
require('dotenv').config();

const { Sequelize } = require('sequelize');
const { createLogger } = require('../utils/logger');

// Initialize logger
const logger = createLogger('database');

// Database configuration
const config = {
  database: process.env.DB_DATABASE || 'real_estate',
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'secret',
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
  logging: (msg) => logger.debug(msg),
  define: {
    timestamps: true,
    underscored: true,
    paranoid: true, // Soft delete
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
};

// Create a Sequelize instance
const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging,
    define: config.define,
    pool: config.pool,
  }
);

// Test the connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection has been established successfully.');
    return true;
  } catch (error) {
    logger.error('Unable to connect to the database:', error);
    return false;
  }
};

module.exports = {
  sequelize,
  testConnection,
};
