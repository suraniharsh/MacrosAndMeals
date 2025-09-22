// Authentication middleware
import { verifyAccessToken, extractTokenFromHeader } from '../utils/jwt.js';
import { log } from '../utils/logger.js';

/**
 * Authentication middleware - verifies JWT access token
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
        error: 'MISSING_TOKEN'
      });
    }

    // Verify the token
    const decoded = verifyAccessToken(token);
    
    // Add user info to request object
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      firstName: decoded.firstName,
      lastName: decoded.lastName
    };

    // Add user logger context
    if (req.logger && typeof req.logger.child === 'function') {
      req.logger = req.logger.child({
        userId: decoded.userId,
        userRole: decoded.role
      });
    }

    log.auth('User authenticated successfully', {
      userId: decoded.userId,
      role: decoded.role,
      email: decoded.email
    });

    next();
  } catch (error) {
    log.security('Authentication failed', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access token expired',
        error: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid access token',
        error: 'INVALID_TOKEN'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: 'AUTH_FAILED'
    });
  }
};

/**
 * Authorization middleware - checks user roles
 * @param {...string} allowedRoles - Allowed user roles
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          error: 'NOT_AUTHENTICATED'
        });
      }

      const userRole = req.user.role;
      
      if (!allowedRoles.includes(userRole)) {
        log.security('Authorization failed - insufficient permissions', {
          userId: req.user.id,
          userRole,
          requiredRoles: allowedRoles,
          endpoint: req.originalUrl
        });

        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          error: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      log.auth('User authorized successfully', {
        userId: req.user.id,
        userRole,
        endpoint: req.originalUrl
      });

      next();
    } catch (error) {
      log.error('Authorization middleware error', {
        userId: req.user?.id,
        endpoint: req.originalUrl
      }, error);

      return res.status(500).json({
        success: false,
        message: 'Authorization check failed',
        error: 'AUTHORIZATION_ERROR'
      });
    }
  };
};

/**
 * Role hierarchy middleware - checks hierarchical permissions
 * SuperAdmin > Admin > Trainer > Customer
 */
export const authorizeHierarchy = (minimumRole) => {
  const roleHierarchy = {
    'CUSTOMER': 0,
    'TRAINER': 1,
    'ADMIN': 2,
    'SUPER_ADMIN': 3
  };

  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          error: 'NOT_AUTHENTICATED'
        });
      }

      const userLevel = roleHierarchy[req.user.role];
      const requiredLevel = roleHierarchy[minimumRole];

      if (userLevel < requiredLevel) {
        log.security('Hierarchical authorization failed', {
          userId: req.user.id,
          userRole: req.user.role,
          userLevel,
          requiredRole: minimumRole,
          requiredLevel,
          endpoint: req.originalUrl
        });

        return res.status(403).json({
          success: false,
          message: 'Insufficient role level',
          error: 'INSUFFICIENT_ROLE_LEVEL'
        });
      }

      next();
    } catch (error) {
      log.error('Hierarchical authorization error', {
        userId: req.user?.id,
        endpoint: req.originalUrl
      }, error);

      return res.status(500).json({
        success: false,
        message: 'Authorization check failed',
        error: 'AUTHORIZATION_ERROR'
      });
    }
  };
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      try {
        const decoded = verifyAccessToken(token);
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          firstName: decoded.firstName,
          lastName: decoded.lastName
        };
      } catch (error) {
        // Ignore token errors in optional auth
        log.debug('Optional auth token verification failed', { error: error.message });
      }
    }

    next();
  } catch (error) {
    log.error('Optional authentication middleware error', {}, error);
    next(); // Continue even if there's an error
  }
};