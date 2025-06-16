// Load environment variables
require('dotenv').config();

const app = require('./app');
const { createLogger } = require('./utils/logger');
const { initializeDbAndRedis } = require('./config/init');
const { testConnection } = require('./config/database');

// Initialize logger
const logger = createLogger('server');

// Get port from environment variable or use default
const PORT = process.env.PORT || 3000;

// Function to start the server
async function startServer() {
  try {
    logger.info(`Starting server on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Test database connection
    await testConnection();
    logger.info('Database connection established successfully');

    // Initialize application services
    await initializeDbAndRedis();

    // Start listening
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // Handle process signals
    handleProcessSignals(server);
  } catch (error) {
    logger.error('Error during server initialization:', error);
    process.exit(1);
  }
}

// Function to handle process signals
function handleProcessSignals(server) {
  process.on('unhandledRejection', (err) => {
    logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
    logger.error(err);
    server.close(() => process.exit(1));
  });

  process.on('SIGTERM', () => {
    logger.info('👋 SIGTERM RECEIVED. Shutting down gracefully');
    server.close(() => logger.info('💥 Process terminated!'));
  });

  process.on('SIGINT', () => {
    logger.info('👋 SIGINT RECEIVED. Shutting down gracefully');
    server.close(() => logger.info('💥 Process terminated!'));
  });
}

// Start the server
startServer();