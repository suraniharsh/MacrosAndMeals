// Authentication controller
// Business rules:
// - SUPER_ADMIN can create any user type
// - ADMIN can create trainers  
// - TRAINER can create customer accounts
// - CUSTOMER has read-only diet/meal plan access

import { authService } from '../services/authService.js';
import { stripeService } from '../services/stripeService.js';
import { subscriptionService } from '../services/subscriptionService.js';
import { validateJWTConfig } from '../utils/jwt.js';
import { PrismaClient } from '../generated/prisma/index.js';

const prisma = new PrismaClient();

// Validate JWT configuration on startup
validateJWTConfig();

export const authController = {
  /**
   * Register a new user
   */
  register: async (req, res) => {
    const logger = req.logger;
    
    try {
      logger.auth('Registration attempt', {
        email: req.body?.email,
        role: req.body?.role
      });

      // Validate required fields
      const { firstName, lastName, email, phoneNumber, password, role } = req.body;
      
      if (!firstName || !lastName || !email || !phoneNumber || !password || !role) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required',
          error: 'MISSING_FIELDS'
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format',
          error: 'INVALID_EMAIL'
        });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long',
          error: 'WEAK_PASSWORD'
        });
      }

      // Validate role
      const validRoles = ['SUPER_ADMIN', 'ADMIN', 'TRAINER', 'CUSTOMER'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role specified',
          error: 'INVALID_ROLE'
        });
      }

      // Role-based authorization check
      if (req.user) {
        const userRole = req.user.role;
        
        // Business rule enforcement
        if (role === 'SUPER_ADMIN' && userRole !== 'SUPER_ADMIN') {
          return res.status(403).json({
            success: false,
            message: 'Only SuperAdmin can create SuperAdmin accounts',
            error: 'INSUFFICIENT_PERMISSIONS'
          });
        }
        
        if (role === 'ADMIN' && !['SUPER_ADMIN'].includes(userRole)) {
          return res.status(403).json({
            success: false,
            message: 'Only SuperAdmin can create Admin accounts',
            error: 'INSUFFICIENT_PERMISSIONS'
          });
        }
        
        if (role === 'TRAINER' && !['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
          return res.status(403).json({
            success: false,
            message: 'Only SuperAdmin or Admin can create Trainer accounts',
            error: 'INSUFFICIENT_PERMISSIONS'
          });
        }
      }

      // Register user
      const result = await authService.register(req.body);

      logger.auth('Registration successful', {
        userId: result.user.id,
        email: result.user.email,
        role: result.user.role
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessTokenExpiresIn: result.tokens.accessTokenExpiresIn
        }
      });
    } catch (error) {
      logger.error('Registration failed', {
        email: req.body?.email,
        role: req.body?.role
      }, error);

      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists',
          error: 'USER_EXISTS'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: 'REGISTRATION_FAILED'
      });
    }
  },

  /**
   * Login user
   */
  login: async (req, res) => {
    const logger = req.logger;
    
    try {
      logger.auth('Login attempt', {
        email: req.body?.email
      });

      // Validate required fields
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
          error: 'MISSING_CREDENTIALS'
        });
      }

      // Login user
      const result = await authService.login({ email, password });

      logger.auth('Login successful', {
        userId: result.user.id,
        email: result.user.email,
        role: result.user.role
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessTokenExpiresIn: result.tokens.accessTokenExpiresIn
        }
      });
    } catch (error) {
      logger.error('Login failed', {
        email: req.body?.email
      }, error);

      if (error.message.includes('Invalid email or password')) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
          error: 'INVALID_CREDENTIALS'
        });
      }

      if (error.message.includes('inactive or suspended')) {
        return res.status(403).json({
          success: false,
          message: 'Account is inactive or suspended',
          error: 'ACCOUNT_INACTIVE'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: 'LOGIN_FAILED'
      });
    }
  },

  /**
   * Logout user
   */
  logout: async (req, res) => {
    const logger = req.logger;
    
    try {
      logger.auth('Logout requested', {
        userId: req.user?.id
      });

      const { refreshToken } = req.body;

      await authService.logout(refreshToken);

      logger.auth('Logout successful', {
        userId: req.user?.id
      });

      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      logger.error('Logout failed', {
        userId: req.user?.id
      }, error);

      res.status(500).json({
        success: false,
        message: 'Logout failed',
        error: 'LOGOUT_FAILED'
      });
    }
  },

  /**
   * Get current user profile
   */
  me: async (req, res) => {
    const logger = req.logger;
    
    try {
      logger.auth('User profile requested', {
        userId: req.user?.id
      });

      // User info is already available from the authenticate middleware
      const user = req.user;

      // Get additional user details
      const fullUser = await authService.findUserById(user.id, user.role);
      if (!fullUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      // Remove password from response
      const { password, ...userResponse } = fullUser;

      logger.auth('User profile retrieved', {
        userId: user.id,
        role: user.role
      });

      res.json({
        success: true,
        message: 'User profile retrieved successfully',
        data: {
          user: userResponse
        }
      });
    } catch (error) {
      logger.error('Get user profile failed', {
        userId: req.user?.id
      }, error);

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve user profile',
        error: 'PROFILE_FAILED'
      });
    }
  },

  /**
   * Refresh access token
   */
  refreshToken: async (req, res) => {
    const logger = req.logger;
    
    try {
      logger.auth('Token refresh requested');

      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required',
          error: 'MISSING_REFRESH_TOKEN'
        });
      }

      const result = await authService.refreshAccessToken(refreshToken);

      logger.auth('Token refresh successful');

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessTokenExpiresIn: result.tokens.accessTokenExpiresIn
        }
      });
    } catch (error) {
      logger.error('Token refresh failed', {}, error);

      if (error.message.includes('expired') || error.message.includes('Invalid')) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired refresh token',
          error: 'INVALID_REFRESH_TOKEN'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Token refresh failed',
        error: 'REFRESH_FAILED'
      });
    }
  },

  /**
   * Create a new Admin (Super Admin only)
   */
  createAdmin: async (req, res) => {
    const logger = req.logger;
    
    try {
      logger.auth('Admin creation attempt', {
        email: req.body?.email,
        requestedBy: req.user.email
      });

      // Validate required fields for Admin
      const { firstName, lastName, email, phoneNumber, password } = req.body;
      
      if (!firstName || !lastName || !email || !phoneNumber || !password) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: firstName, lastName, email, phoneNumber, password',
          error: 'MISSING_REQUIRED_FIELDS'
        });
      }

      // Force role to ADMIN
      const adminData = {
        ...req.body,
        role: 'ADMIN'
      };

      // Register admin
      const result = await authService.register(adminData);

      logger.auth('Admin creation successful', {
        adminId: result.user.id,
        email: result.user.email,
        createdBy: req.user.email
      });

      res.status(201).json({
        success: true,
        message: 'Admin created successfully',
        data: {
          admin: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessTokenExpiresIn: result.tokens.accessTokenExpiresIn
        }
      });
    } catch (error) {
      logger.error('Admin creation failed', {
        email: req.body?.email,
        requestedBy: req.user.email
      }, error);

      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: 'Admin with this email already exists',
          error: 'ADMIN_EXISTS'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Admin creation failed',
        error: 'ADMIN_CREATION_FAILED'
      });
    }
  },

  /**
   * Create a new Trainer (Admin only)
   */
  createTrainer: async (req, res) => {
    const logger = req.logger;
    
    try {
      logger.auth('Trainer creation attempt', {
        email: req.body?.email,
        requestedBy: req.user.email
      });

      // Validate required fields for Trainer
      const { firstName, lastName, email, phoneNumber, password } = req.body;
      
      if (!firstName || !lastName || !email || !phoneNumber || !password) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: firstName, lastName, email, phoneNumber, password',
          error: 'MISSING_REQUIRED_FIELDS'
        });
      }

      // Force role to TRAINER and set the adminId
      const trainerData = {
        ...req.body,
        role: 'TRAINER',
        adminId: req.user.id // Link trainer to the requesting admin
      };

      // Register trainer
      const result = await authService.register(trainerData);

      logger.auth('Trainer creation successful', {
        trainerId: result.user.id,
        email: result.user.email,
        createdBy: req.user.email,
        adminId: req.user.id
      });

      res.status(201).json({
        success: true,
        message: 'Trainer created successfully',
        data: {
          trainer: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessTokenExpiresIn: result.tokens.accessTokenExpiresIn
        }
      });
    } catch (error) {
      logger.error('Trainer creation failed', {
        email: req.body?.email,
        requestedBy: req.user.email
      }, error);

      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: 'Trainer with this email already exists',
          error: 'TRAINER_EXISTS'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Trainer creation failed',
        error: 'TRAINER_CREATION_FAILED'
      });
    }
  },

  /**
   * Register with plan selection (for self-signup)
   */
  registerWithPlan: async (req, res) => {
    const logger = req.logger;
    
    try {
      const { firstName, lastName, name, email, phoneNumber, password, role, planId, planType } = req.body;

      // Handle different name formats
      const fName = firstName || (name ? name.split(' ')[0] : '');
      const lName = lastName || (name ? name.split(' ').slice(1).join(' ') || '' : '');

      // Handle different plan formats
      const selectedPlanId = planId || planType;

      // Validate required fields
      if (!fName || !email || !password || !role || !selectedPlanId) {
        return res.status(400).json({
          success: false,
          message: 'Required fields: name/firstName, email, password, role, planId/planType',
          error: 'MISSING_FIELDS'
        });
      }

      // Only allow ADMIN and TRAINER for self-signup with plans
      if (!['ADMIN', 'TRAINER'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role for plan registration',
          error: 'INVALID_ROLE'
        });
      }

      logger.auth('Registration with plan attempt', {
        email,
        role,
        planId: selectedPlanId
      });

      // Get the selected plan (handle both planId and planType)
      let plan;
      if (selectedPlanId.length < 30) { // Likely a planType string
        plan = await prisma.subscriptionPlan.findFirst({
          where: { 
            planType: selectedPlanId,
            isActive: true
          }
        });
      } else { // Likely a UUID planId
        plan = await prisma.subscriptionPlan.findUnique({
          where: { 
            id: selectedPlanId,
            isActive: true
          }
        });
      }

      if (!plan) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or inactive subscription plan',
          error: 'INVALID_PLAN'
        });
      }

      // Register the user
      const result = await authService.register({
        firstName: fName,
        lastName: lName,
        email,
        phoneNumber: phoneNumber || '',
        password,
        role
      });

      // Create Stripe customer
      const stripeCustomer = await stripeService.createCustomer(
        email,
        `${fName} ${lName}`,
        { userId: result.user.id, role }
      );

      // Create subscription
      const subscription = await subscriptionService.createSubscription(
        result.user.id,
        role,
        plan.id,
        stripeCustomer.id
      );

      // If it's a free plan, return success
      if (plan.planType === 'FREE') {
        logger.auth('Free plan registration completed', {
          userId: result.user.id,
          email,
          role
        });

        return res.status(201).json({
          success: true,
          message: 'User registered successfully with free plan',
          data: {
            user: result.user,
            subscription: {
              plan: plan.name,
              maxCustomers: plan.maxCustomers,
              status: 'ACTIVE'
            },
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            accessTokenExpiresIn: result.tokens.accessTokenExpiresIn
          }
        });
      }

      // For paid plans, create checkout session
      const checkoutSession = await stripeService.createCheckoutSession(
        stripeCustomer.id,
        plan.stripePriceId,
        `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        `${process.env.FRONTEND_URL}/payment-cancel`,
        {
          userId: result.user.id,
          subscriptionId: subscription.id,
          role
        }
      );

      logger.auth('Paid plan registration initiated', {
        userId: result.user.id,
        email,
        role,
        planType: plan.planType,
        checkoutSessionId: checkoutSession.id
      });

      return res.status(201).json({
        success: true,
        message: 'User registered successfully. Complete payment to activate subscription.',
        data: {
          user: result.user,
          subscription: {
            plan: plan.name,
            price: plan.price,
            maxCustomers: plan.maxCustomers,
            status: 'PENDING_PAYMENT'
          },
          checkoutUrl: checkoutSession.url,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          accessTokenExpiresIn: result.tokens.accessTokenExpiresIn
        }
      });

    } catch (error) {
      logger.error('Registration with plan failed', {
        email: req.body?.email,
        role: req.body?.role,
        planId: req.body?.planId,
        error: error.message
      });

      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: 'User with this email already exists',
          error: 'USER_EXISTS'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: 'REGISTRATION_ERROR'
      });
    }
  }
};