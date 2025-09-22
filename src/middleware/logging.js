import { log } from '../utils/logger.js';

/**
 * Request logging middleware to track HTTP requests and responses
 * Replaces morgan with more detailed and structured logging
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  // Add request ID to request object for use in other middleware/controllers
  req.requestId = requestId;
  
  // Create child logger with request context
  req.logger = log.child({
    requestId,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress
  });

  // Log incoming request
  req.logger.http('Incoming request', {
    method: req.method,
    url: req.originalUrl,
    headers: sanitizeHeaders(req.headers),
    query: req.query,
    body: sanitizeBody(req.body)
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - startTime;
    
    // Log response
    req.logger.http('Outgoing response', {
      statusCode: res.statusCode,
      duration,
      responseSize: JSON.stringify(body).length
    });

    // Log performance if request is slow
    if (duration > 1000) {
      req.logger.performance(req.originalUrl, duration, {
        method: req.method,
        statusCode: res.statusCode
      });
    }

    return originalJson.call(this, body);
  };

  // Log errors if response has error status
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    if (res.statusCode >= 400) {
      const level = res.statusCode >= 500 ? 'error' : 'warn';
      req.logger[level]('Request completed with error', {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration
      });
    }
  });

  next();
};

/**
 * Error logging middleware to catch and log unhandled errors
 */
export const errorLogger = (error, req, res, next) => {
  const logger = req.logger || log;
  
  // Log the error with full context
  logger.error('Unhandled error in request', {
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode || 500,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress
  }, error);

  // Continue to next error handler
  next(error);
};

/**
 * Generate unique request ID for tracking
 */
function generateRequestId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Sanitize headers to remove sensitive information
 */
function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  
  // Remove sensitive headers
  delete sanitized.authorization;
  delete sanitized.cookie;
  delete sanitized['x-api-key'];
  
  return sanitized;
}

/**
 * Sanitize request body to remove sensitive information
 */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized = { ...body };
  
  // Remove sensitive fields
  if (sanitized.password) sanitized.password = '[REDACTED]';
  if (sanitized.confirmPassword) sanitized.confirmPassword = '[REDACTED]';
  if (sanitized.oldPassword) sanitized.oldPassword = '[REDACTED]';
  if (sanitized.newPassword) sanitized.newPassword = '[REDACTED]';
  if (sanitized.token) sanitized.token = '[REDACTED]';
  if (sanitized.apiKey) sanitized.apiKey = '[REDACTED]';
  if (sanitized.secret) sanitized.secret = '[REDACTED]';
  
  return sanitized;
}