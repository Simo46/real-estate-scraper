const { createLogger } = require('../utils/logger');

// Initialize logger
const logger = createLogger('errorHandler');

/**
 * Error types enum
 */
const ErrorTypes = {
  VALIDATION: 'VALIDATION_ERROR',
  AUTHENTICATION: 'AUTHENTICATION_ERROR',
  AUTHORIZATION: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND_ERROR',
  CONFLICT: 'CONFLICT_ERROR',
  BUSINESS: 'BUSINESS_ERROR',
  DATABASE: 'DATABASE_ERROR',
  EXTERNAL_SERVICE: 'EXTERNAL_SERVICE_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR',
  RATE_LIMIT: 'RATE_LIMIT_ERROR',
  ROLE_INVALID: 'ROLE_INVALID_ERROR',
  PRE_AUTH_EXPIRED: 'PRE_AUTH_EXPIRED_ERROR',
  TOKEN_REUSED: 'TOKEN_REUSED_ERROR',
  MULTI_ROLE_REQUIRED: 'MULTI_ROLE_REQUIRED_ERROR'
};

/**
 * Custom error class for operational errors
 */
class AppError extends Error {
  constructor(message, statusCode, type = ErrorTypes.UNKNOWN, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.type = type;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create a validation error
   * @param {string} message - Error message
   * @param {any} details - Validation error details
   * @returns {AppError} - Validation error
   */
  static validation(message = 'Validation Error', details = null) {
    return new AppError(message, 400, ErrorTypes.VALIDATION, details);
  }

  /**
   * Create an authentication error
   * @param {string} message - Error message
   * @returns {AppError} - Authentication error
   */
  static authentication(message = 'Authentication Error') {
    return new AppError(message, 401, ErrorTypes.AUTHENTICATION);
  }

  /**
   * Create an authorization error
   * @param {string} message - Error message
   * @returns {AppError} - Authorization error
   */
  static authorization(message = 'Authorization Error') {
    return new AppError(message, 403, ErrorTypes.AUTHORIZATION);
  }

  /**
   * Create a not found error
   * @param {string} message - Error message
   * @returns {AppError} - Not found error
   */
  static notFound(message = 'Resource Not Found') {
    return new AppError(message, 404, ErrorTypes.NOT_FOUND);
  }

  /**
   * Create a conflict error
   * @param {string} message - Error message
   * @returns {AppError} - Conflict error
   */
  static conflict(message = 'Conflict Error') {
    return new AppError(message, 409, ErrorTypes.CONFLICT);
  }

  /**
   * Create a business logic error
   * @param {string} message - Error message
   * @param {any} details - Error details
   * @returns {AppError} - Business logic error
   */
  static business(message = 'Business Logic Error', details = null) {
    return new AppError(message, 422, ErrorTypes.BUSINESS, details);
  }

  /**
   * Create a database error
   * @param {string} message - Error message
   * @returns {AppError} - Database error
   */
  static database(message = 'Database Error') {
    return new AppError(message, 500, ErrorTypes.DATABASE);
  }

  /**
   * Create an external service error
   * @param {string} message - Error message
   * @returns {AppError} - External service error
   */
  static externalService(message = 'External Service Error') {
    return new AppError(message, 503, ErrorTypes.EXTERNAL_SERVICE);
  }

  /**
   * Create a tenant error
   * @param {string} message - Error message
   * @returns {AppError} - Tenant error
   */
  static tenant(message = 'Tenant Error') {
    return new AppError(message, 400, ErrorTypes.TENANT);
  }

  /**
   * Create a rate limit error
   * @param {string} message - Error message
   * @param {Object} details - Rate limit details (retryAfter, etc.)
   * @returns {AppError} - Rate limit error
   */
  static rateLimit(message = 'Rate Limit Exceeded', details = null) {
    return new AppError(message, 429, ErrorTypes.RATE_LIMIT, details);
  }

  /**
   * Create a role invalid error
   * @param {string} message - Error message
   * @param {Object} details - Role error details
   * @returns {AppError} - Role invalid error
   */
  static roleInvalid(message = 'Role Invalid or Unavailable', details = null) {
    return new AppError(message, 403, ErrorTypes.ROLE_INVALID, details);
  }

  /**
   * Create a pre-auth token expired error
   * @param {string} message - Error message
   * @returns {AppError} - Pre-auth expired error
   */
  static preAuthExpired(message = 'Pre-authentication Token Expired') {
    return new AppError(message, 401, ErrorTypes.PRE_AUTH_EXPIRED);
  }

  /**
   * Create a token reused error
   * @param {string} message - Error message
   * @returns {AppError} - Token reused error
   */
  static tokenReused(message = 'Token Already Used') {
    return new AppError(message, 422, ErrorTypes.TOKEN_REUSED);
  }

  /**
   * Create a multi-role required error
   * @param {string} message - Error message
   * @param {Object} details - Available roles and selection data
   * @returns {AppError} - Multi-role required error
   */
  static multiRoleRequired(message = 'Role Selection Required', details = null) {
    return new AppError(message, 200, ErrorTypes.MULTI_ROLE_REQUIRED, details);
  }
}

/**
 * Handle Sequelize validation errors
 */
const handleSequelizeValidationError = (err) => {
  const validationErrors = err.errors.map((error) => ({
    field: error.path,
    message: error.message,
  }));

  return AppError.validation('Validation error', validationErrors);
};

/**
 * Handle Sequelize unique constraint errors
 */
const handleSequelizeUniqueConstraintError = (err) => {
  const field = err.errors[0]?.path || 'unknown field';
  return AppError.conflict(`Duplicate value for ${field}`);
};

/**
 * Handle Sequelize foreign key constraint errors
 */
const handleSequelizeForeignKeyConstraintError = (err) => {
  return AppError.business(`Foreign key constraint error: ${err.message}`);
};

/**
 * Handle JWT errors
 */
const handleJWTError = () => {
  return AppError.authentication('Invalid token. Please log in again.');
};

/**
 * Handle JWT expired errors
 */
const handleJWTExpiredError = () => {
  return AppError.authentication('Your token has expired. Please log in again.');
};

 /**
   * Handle tenant errors
   */
 const handleTenantError = (err) => {
  return AppError.tenant(err.message || 'Tenant not found or access denied');
};

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Add request ID to error object if available
  if (req.id) {
    err.requestId = req.id;
  }

  // Standardize error format
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  error.status = err.status || 'error';
  error.type = err.type || ErrorTypes.UNKNOWN;
  error.details = err.details || null;
  error.stack = err.stack;
  
  // Handle specific error types
  if (error.name === 'SequelizeValidationError') {
    error = handleSequelizeValidationError(err);
  } else if (error.name === 'SequelizeUniqueConstraintError') {
    error = handleSequelizeUniqueConstraintError(err);
  } else if (error.name === 'SequelizeForeignKeyConstraintError') {
    error = handleSequelizeForeignKeyConstraintError(err);
  } else if (error.name === 'JsonWebTokenError') {
    error = handleJWTError();
  } else if (error.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  } else if (error.name === 'TenantError') {
    error = handleTenantError(err);
  }

  // Log the error
  if (error.statusCode >= 500) {
    logger.error({ 
      err: error,
      stack: error.stack,
      requestId: req.id || 'unknown',
      path: req.originalUrl,
      method: req.method,
    }, `${error.statusCode} - ${error.message}`);
  } else {
    logger.warn({ 
      err: error,
      requestId: req.id || 'unknown',
      path: req.originalUrl,
      method: req.method,
    }, `${error.statusCode} - ${error.message}`);
  }

  // Different error handling for development and production
  if (process.env.NODE_ENV === 'development') {
    return sendDevError(error, res);
  }

  // For production, send clean error messages for operational errors
  // and generic messages for programming errors
  if (err.isOperational) {
    return sendProductionError(error, res);
  }

  // Programming or unknown errors: don't leak error details
  error.message = 'Something went wrong';
  error.statusCode = 500;
  error.type = ErrorTypes.UNKNOWN;
  error.details = null;
  return sendProductionError(error, res);
};

/**
 * Send detailed error response in development environment
 */
const sendDevError = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    type: err.type,
    message: err.message,
    details: err.details,
    stack: err.stack,
    requestId: err.requestId,
  });
};

/**
 * Send clean error response in production environment
 */
const sendProductionError = (err, res) => {
  const response = {
    status: err.status,
    type: err.type,
    message: err.message,
  };

  // Include request ID for tracking
  if (err.requestId) {
    response.requestId = err.requestId;
  }

  // Include details for validation errors
  if (err.type === ErrorTypes.VALIDATION && err.details) {
    response.details = err.details;
  }

  res.status(err.statusCode).json(response);
};

module.exports = {
  AppError,
  ErrorTypes,
  errorHandler,
};