import jwt from 'jsonwebtoken';
import { log } from './logger.js';

/**
 * JWT utility functions for token generation, verification, and management
 */

// Default expiration times
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Generate JWT access token
 * @param {Object} payload - Token payload
 * @param {string} payload.userId - User ID
 * @param {string} payload.email - User email
 * @param {string} payload.role - User role (SUPER_ADMIN, ADMIN, TRAINER, CUSTOMER)
 * @param {string} payload.firstName - User first name
 * @param {string} payload.lastName - User last name
 * @returns {string} JWT access token
 */
export const generateAccessToken = (payload) => {
  try {
    const token = jwt.sign(
      {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        firstName: payload.firstName,
        lastName: payload.lastName,
        type: 'access'
      },
      process.env.JWT_SECRET,
      {
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        issuer: 'macrosandmeals-api',
        audience: 'macrosandmeals-client'
      }
    );

    log.auth('Access token generated', {
      userId: payload.userId,
      role: payload.role,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN
    });

    return token;
  } catch (error) {
    log.error('Failed to generate access token', { userId: payload.userId }, error);
    throw new Error('Token generation failed');
  }
};

/**
 * Generate JWT refresh token
 * @param {Object} payload - Token payload
 * @param {string} payload.userId - User ID
 * @param {string} payload.role - User role
 * @returns {string} JWT refresh token
 */
export const generateRefreshToken = (payload) => {
  try {
    const token = jwt.sign(
      {
        userId: payload.userId,
        role: payload.role,
        type: 'refresh'
      },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      {
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
        issuer: 'macrosandmeals-api',
        audience: 'macrosandmeals-client'
      }
    );

    log.auth('Refresh token generated', {
      userId: payload.userId,
      role: payload.role,
      expiresIn: REFRESH_TOKEN_EXPIRES_IN
    });

    return token;
  } catch (error) {
    log.error('Failed to generate refresh token', { userId: payload.userId }, error);
    throw new Error('Refresh token generation failed');
  }
};

/**
 * Verify JWT access token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
export const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'macrosandmeals-api',
      audience: 'macrosandmeals-client'
    });

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    log.auth('Access token verified', {
      userId: decoded.userId,
      role: decoded.role
    });

    return decoded;
  } catch (error) {
    log.security('Access token verification failed', {
      error: error.message,
      token: token?.substring(0, 20) + '...'
    });
    throw error;
  }
};

/**
 * Verify JWT refresh token
 * @param {string} token - JWT refresh token to verify
 * @returns {Object} Decoded token payload
 */
export const verifyRefreshToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
      issuer: 'macrosandmeals-api',
      audience: 'macrosandmeals-client'
    });

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    log.auth('Refresh token verified', {
      userId: decoded.userId,
      role: decoded.role
    });

    return decoded;
  } catch (error) {
    log.security('Refresh token verification failed', {
      error: error.message
    });
    throw error;
  }
};

/**
 * Generate token pair (access + refresh)
 * @param {Object} user - User object
 * @returns {Object} Token pair
 */
export const generateTokenPair = (user) => {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role || getRoleFromModel(user),
    firstName: user.firstName,
    lastName: user.lastName
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN,
    refreshTokenExpiresIn: REFRESH_TOKEN_EXPIRES_IN
  };
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token
 */
export const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};

/**
 * Calculate token expiration date
 * @param {string} expiresIn - Expiration string (e.g., '15m', '7d')
 * @returns {Date} Expiration date
 */
export const calculateExpirationDate = (expiresIn = REFRESH_TOKEN_EXPIRES_IN) => {
  const now = new Date();
  
  // Parse expiration string
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error('Invalid expiration format');
  }

  const [, amount, unit] = match;
  const value = parseInt(amount);

  switch (unit) {
    case 's': // seconds
      return new Date(now.getTime() + value * 1000);
    case 'm': // minutes
      return new Date(now.getTime() + value * 60 * 1000);
    case 'h': // hours
      return new Date(now.getTime() + value * 60 * 60 * 1000);
    case 'd': // days
      return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    default:
      throw new Error('Invalid time unit');
  }
};

/**
 * Get user role from model type (for backward compatibility)
 * @param {Object} user - User object from any model
 * @returns {string} User role
 */
const getRoleFromModel = (user) => {
  // This function helps determine role from legacy separate models
  if (user.superAdminId !== undefined) return 'ADMIN';
  if (user.adminId !== undefined) return 'TRAINER';
  if (user.trainerId !== undefined) return 'CUSTOMER';
  return 'CUSTOMER'; // default
};

/**
 * Validate JWT configuration
 * @throws {Error} If JWT configuration is invalid
 */
export const validateJWTConfig = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  if (process.env.JWT_SECRET.length < 32) {
    log.warn('JWT secret is shorter than recommended 32 characters');
  }

  log.info('JWT configuration validated successfully');
};