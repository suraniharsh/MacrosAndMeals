// Authentication service
import bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/index.js';
import { generateTokenPair, calculateExpirationDate, verifyRefreshToken } from '../utils/jwt.js';
import { log } from '../utils/logger.js';

const prisma = new PrismaClient();

export const authService = {
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @param {string} userData.firstName - User's first name
   * @param {string} userData.lastName - User's last name
   * @param {string} userData.email - User's email
   * @param {string} userData.phoneNumber - User's phone number
   * @param {string} userData.password - User's password
   * @param {string} userData.role - User's role (SUPER_ADMIN, ADMIN, TRAINER, CUSTOMER)
   * @param {string} [userData.superAdminId] - SuperAdmin ID (for admin registration)
   * @param {string} [userData.adminId] - Admin ID (for trainer registration)
   * @param {string} [userData.trainerId] - Trainer ID (for customer registration)
   * @returns {Object} User and tokens
   */
  register: async (userData) => {
    try {
      log.auth('Registration attempt started', {
        email: userData.email,
        role: userData.role
      });

      // Check if user already exists
      const existingUser = await authService.findUserByEmail(userData.email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

      // Create user based on role
      let user;
      switch (userData.role) {
        case 'SUPER_ADMIN':
          user = await prisma.superAdmin.create({
            data: {
              firstName: userData.firstName,
              lastName: userData.lastName,
              email: userData.email,
              phoneNumber: userData.phoneNumber,
              password: hashedPassword
            }
          });
          user.role = 'SUPER_ADMIN';
          break;

        case 'ADMIN':
          user = await prisma.admin.create({
            data: {
              firstName: userData.firstName,
              lastName: userData.lastName,
              email: userData.email,
              phoneNumber: userData.phoneNumber,
              password: hashedPassword,
              superAdminId: userData.superAdminId || null
            }
          });
          user.role = 'ADMIN';
          break;

        case 'TRAINER':
          user = await prisma.trainer.create({
            data: {
              firstName: userData.firstName,
              lastName: userData.lastName,
              email: userData.email,
              phoneNumber: userData.phoneNumber,
              password: hashedPassword,
              adminId: userData.adminId || null
            }
          });
          user.role = 'TRAINER';
          break;

        case 'CUSTOMER':
          user = await prisma.customer.create({
            data: {
              firstName: userData.firstName,
              lastName: userData.lastName,
              email: userData.email,
              phoneNumber: userData.phoneNumber,
              password: hashedPassword,
              birthDate: userData.birthDate ? new Date(userData.birthDate) : new Date(),
              gender: userData.gender || 'OTHER',
              measurementStandard: userData.measurementStandard || 'US_STANDARD',
              height: userData.height || 0,
              weight: userData.weight || 0,
              activityLevel: userData.activityLevel || 'MEDIUM',
              mealsPerDay: userData.mealsPerDay || 3,
              fitnessGoal: userData.fitnessGoal || 'NONE',
              mealPlanCategory: userData.mealPlanCategory || 'BALANCED',
              accessLevel: userData.accessLevel || 'NONE',
              trainerId: userData.trainerId || null
            }
          });
          user.role = 'CUSTOMER';
          break;

        default:
          throw new Error('Invalid role specified');
      }

      // Generate tokens
      const tokens = generateTokenPair(user);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          userRole: user.role,
          expiresAt: calculateExpirationDate(tokens.refreshTokenExpiresIn)
        }
      });

      log.auth('User registered successfully', {
        userId: user.id,
        email: user.email,
        role: user.role
      });

      // Remove password from response
      const { password, ...userResponse } = user;

      return {
        user: userResponse,
        tokens
      };
    } catch (error) {
      log.error('Registration failed', {
        email: userData.email,
        role: userData.role
      }, error);
      throw error;
    }
  },

  /**
   * Login user
   * @param {Object} credentials - Login credentials
   * @param {string} credentials.email - User's email
   * @param {string} credentials.password - User's password
   * @returns {Object} User and tokens
   */
  login: async (credentials) => {
    try {
      log.auth('Login attempt started', {
        email: credentials.email
      });

      // Find user by email across all role tables
      const user = await authService.findUserByEmail(credentials.email);
      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Check if user is active (except for SuperAdmin)
      if (user.status && user.status !== 'ACTIVE') {
        throw new Error('Account is inactive or suspended');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      // Generate tokens
      const tokens = generateTokenPair(user);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          userRole: user.role,
          expiresAt: calculateExpirationDate(tokens.refreshTokenExpiresIn)
        }
      });

      log.auth('User logged in successfully', {
        userId: user.id,
        email: user.email,
        role: user.role
      });

      // Remove password from response
      const { password, ...userResponse } = user;

      return {
        user: userResponse,
        tokens
      };
    } catch (error) {
      log.error('Login failed', {
        email: credentials.email
      }, error);
      throw error;
    }
  },

  /**
   * Logout user (invalidate refresh token)
   * @param {string} refreshToken - Refresh token to invalidate
   * @returns {Object} Success message
   */
  logout: async (refreshToken) => {
    try {
      if (!refreshToken) {
        throw new Error('Refresh token required');
      }

      // Delete refresh token from database
      const deletedToken = await prisma.refreshToken.deleteMany({
        where: { token: refreshToken }
      });

      log.auth('User logged out successfully', {
        tokensDeleted: deletedToken.count
      });

      return { message: 'Logged out successfully' };
    } catch (error) {
      log.error('Logout failed', {}, error);
      throw error;
    }
  },

  /**
   * Refresh access token
   * @param {string} refreshToken - Valid refresh token
   * @returns {Object} New token pair
   */
  refreshAccessToken: async (refreshToken) => {
    try {
      if (!refreshToken) {
        throw new Error('Refresh token required');
      }

      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);

      // Check if refresh token exists in database
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken }
      });

      if (!storedToken) {
        throw new Error('Invalid refresh token');
      }

      // Check if token is expired
      if (storedToken.expiresAt < new Date()) {
        await prisma.refreshToken.delete({
          where: { token: refreshToken }
        });
        throw new Error('Refresh token expired');
      }

      // Get user details
      const user = await authService.findUserById(decoded.userId, decoded.role);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new token pair
      const tokens = generateTokenPair(user);

      // Replace old refresh token with new one
      await prisma.refreshToken.update({
        where: { token: refreshToken },
        data: {
          token: tokens.refreshToken,
          expiresAt: calculateExpirationDate(tokens.refreshTokenExpiresIn)
        }
      });

      log.auth('Access token refreshed successfully', {
        userId: user.id,
        role: user.role
      });

      return { tokens };
    } catch (error) {
      log.error('Token refresh failed', {}, error);
      throw error;
    }
  },

  /**
   * Find user by email across all role tables
   * @param {string} email - User's email
   * @returns {Object|null} User object with role
   */
  findUserByEmail: async (email) => {
    try {
      // Check SuperAdmin
      let user = await prisma.superAdmin.findUnique({
        where: { email }
      });
      if (user) {
        user.role = 'SUPER_ADMIN';
        return user;
      }

      // Check Admin
      user = await prisma.admin.findUnique({
        where: { email }
      });
      if (user) {
        user.role = 'ADMIN';
        return user;
      }

      // Check Trainer
      user = await prisma.trainer.findUnique({
        where: { email }
      });
      if (user) {
        user.role = 'TRAINER';
        return user;
      }

      // Check Customer
      user = await prisma.customer.findUnique({
        where: { email }
      });
      if (user) {
        user.role = 'CUSTOMER';
        return user;
      }

      return null;
    } catch (error) {
      log.error('Find user by email failed', { email }, error);
      throw error;
    }
  },

  /**
   * Find user by ID and role
   * @param {string} userId - User's ID
   * @param {string} role - User's role
   * @returns {Object|null} User object
   */
  findUserById: async (userId, role) => {
    try {
      let user;
      switch (role) {
        case 'SUPER_ADMIN':
          user = await prisma.superAdmin.findUnique({
            where: { id: userId }
          });
          break;
        case 'ADMIN':
          user = await prisma.admin.findUnique({
            where: { id: userId }
          });
          break;
        case 'TRAINER':
          user = await prisma.trainer.findUnique({
            where: { id: userId }
          });
          break;
        case 'CUSTOMER':
          user = await prisma.customer.findUnique({
            where: { id: userId }
          });
          break;
        default:
          return null;
      }

      if (user) {
        user.role = role;
      }

      return user;
    } catch (error) {
      log.error('Find user by ID failed', { userId, role }, error);
      throw error;
    }
  }
};