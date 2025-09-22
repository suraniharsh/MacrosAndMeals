import { logger } from '../config/logger.js';

/**
 * Professional logging utility for the MacrosAndMeals application
 * Provides structured logging with different levels and context tracking
 */
class Logger {
  /**
   * Log error messages with stack traces
   * @param {string} message - Error message
   * @param {Object} meta - Additional metadata
   * @param {Error} error - Error object with stack trace
   */
  error(message, meta = {}, error = null) {
    const logData = {
      ...meta,
      ...(error && { 
        error: error.message,
        stack: error.stack 
      })
    };
    logger.error(message, logData);
  }

  /**
   * Log warning messages
   * @param {string} message - Warning message
   * @param {Object} meta - Additional metadata
   */
  warn(message, meta = {}) {
    logger.warn(message, meta);
  }

  /**
   * Log informational messages
   * @param {string} message - Info message
   * @param {Object} meta - Additional metadata
   */
  info(message, meta = {}) {
    logger.info(message, meta);
  }

  /**
   * Log HTTP requests and responses
   * @param {string} message - HTTP message
   * @param {Object} meta - Request/response metadata
   */
  http(message, meta = {}) {
    logger.http(message, meta);
  }

  /**
   * Log debug messages (development only)
   * @param {string} message - Debug message
   * @param {Object} meta - Additional metadata
   */
  debug(message, meta = {}) {
    logger.debug(message, meta);
  }

  /**
   * Log authentication events
   * @param {string} action - Auth action (login, logout, register, etc.)
   * @param {Object} meta - Auth metadata
   */
  auth(action, meta = {}) {
    this.info(`Auth: ${action}`, {
      category: 'authentication',
      action,
      ...meta
    });
  }

  /**
   * Log business logic events
   * @param {string} action - Business action
   * @param {Object} meta - Business metadata
   */
  business(action, meta = {}) {
    this.info(`Business: ${action}`, {
      category: 'business',
      action,
      ...meta
    });
  }

  /**
   * Log database operations
   * @param {string} operation - DB operation (create, read, update, delete)
   * @param {string} table - Database table/collection
   * @param {Object} meta - DB metadata
   */
  database(operation, table, meta = {}) {
    this.debug(`Database: ${operation} on ${table}`, {
      category: 'database',
      operation,
      table,
      ...meta
    });
  }

  /**
   * Log payment/billing events
   * @param {string} action - Billing action
   * @param {Object} meta - Billing metadata
   */
  billing(action, meta = {}) {
    this.info(`Billing: ${action}`, {
      category: 'billing',
      action,
      ...meta
    });
  }

  /**
   * Log security events
   * @param {string} event - Security event
   * @param {Object} meta - Security metadata
   */
  security(event, meta = {}) {
    this.warn(`Security: ${event}`, {
      category: 'security',
      event,
      ...meta
    });
  }

  /**
   * Log API endpoint performance
   * @param {string} endpoint - API endpoint
   * @param {number} duration - Request duration in ms
   * @param {Object} meta - Performance metadata
   */
  performance(endpoint, duration, meta = {}) {
    const level = duration > 1000 ? 'warn' : 'info';
    this[level](`Performance: ${endpoint} took ${duration}ms`, {
      category: 'performance',
      endpoint,
      duration,
      ...meta
    });
  }

  /**
   * Create a child logger with consistent context
   * @param {Object} context - Context to add to all logs
   * @returns {Object} Child logger with context
   */
  child(context = {}) {
    return {
      error: (message, meta = {}, error = null) => this.error(message, { ...context, ...meta }, error),
      warn: (message, meta = {}) => this.warn(message, { ...context, ...meta }),
      info: (message, meta = {}) => this.info(message, { ...context, ...meta }),
      http: (message, meta = {}) => this.http(message, { ...context, ...meta }),
      debug: (message, meta = {}) => this.debug(message, { ...context, ...meta }),
      auth: (action, meta = {}) => this.auth(action, { ...context, ...meta }),
      business: (action, meta = {}) => this.business(action, { ...context, ...meta }),
      database: (operation, table, meta = {}) => this.database(operation, table, { ...context, ...meta }),
      billing: (action, meta = {}) => this.billing(action, { ...context, ...meta }),
      security: (event, meta = {}) => this.security(event, { ...context, ...meta }),
      performance: (endpoint, duration, meta = {}) => this.performance(endpoint, duration, { ...context, ...meta })
    };
  }
}

// Export singleton instance
export const log = new Logger();

// Export class for testing
export { Logger };