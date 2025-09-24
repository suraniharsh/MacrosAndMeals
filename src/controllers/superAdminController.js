import { superAdminService } from '../services/superAdminService.js';

export const superAdminController = {
  /**
   * Get platform dashboard statistics
   * GET /api/super-admin/dashboard
   */
  getDashboard: async (req, res) => {
    const logger = req.logger;

    try {
      logger.business('Super Admin dashboard accessed', {
        userId: req.user.id,
        userRole: req.user.role
      });

      const dashboardData = await superAdminService.getPlatformStats();

      return res.json({
        success: true,
        message: 'Platform dashboard retrieved successfully',
        data: dashboardData
      });

    } catch (error) {
      logger.error('Failed to get Super Admin dashboard', {
        userId: req.user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard data',
        error: 'DASHBOARD_FETCH_ERROR'
      });
    }
  },

  /**
   * Get system health metrics
   * GET /api/super-admin/health
   */
  getSystemHealth: async (req, res) => {
    const logger = req.logger;

    try {
      logger.business('Super Admin system health accessed', {
        userId: req.user.id,
        userRole: req.user.role
      });

      const healthData = await superAdminService.getSystemHealth();

      return res.json({
        success: true,
        message: 'System health retrieved successfully',
        data: healthData
      });

    } catch (error) {
      logger.error('Failed to get system health', {
        userId: req.user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve system health',
        error: 'HEALTH_CHECK_ERROR'
      });
    }
  },

  /**
   * Get platform analytics overview
   * GET /api/super-admin/analytics
   */
  getAnalytics: async (req, res) => {
    const logger = req.logger;

    try {
      const { timeframe = '30d' } = req.query;

      logger.business('Super Admin analytics accessed', {
        userId: req.user.id,
        timeframe
      });

      // For now, return the same dashboard data
      // In the future, this could be expanded with time-based filtering
      const analyticsData = await superAdminService.getPlatformStats();

      return res.json({
        success: true,
        message: 'Platform analytics retrieved successfully',
        data: {
          ...analyticsData,
          timeframe,
          filters: {
            period: timeframe,
            generatedAt: new Date()
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get platform analytics', {
        userId: req.user.id,
        timeframe: req.query.timeframe,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve analytics data',
        error: 'ANALYTICS_FETCH_ERROR'
      });
    }
  },

  /**
   * Get comprehensive revenue analytics
   * GET /api/super-admin/revenue
   */
  getRevenue: async (req, res) => {
    const logger = req.logger;

    try {
      const { timeframe = '12m' } = req.query;

      logger.business('Super Admin revenue analytics accessed', {
        userId: req.user.id,
        timeframe
      });

      const revenueData = await superAdminService.getRevenueAnalytics(timeframe);

      return res.json({
        success: true,
        message: 'Revenue analytics retrieved successfully',
        data: revenueData
      });

    } catch (error) {
      logger.error('Failed to get revenue analytics', {
        userId: req.user.id,
        timeframe: req.query.timeframe,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve revenue analytics',
        error: 'REVENUE_ANALYTICS_ERROR'
      });
    }
  },

  // ==================== USER MANAGEMENT METHODS ====================

  /**
   * Get all users with filtering and pagination
   * GET /api/super-admin/users
   */
  getUsers: async (req, res) => {
    const logger = req.logger;

    try {
      const {
        role,
        status,
        search,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      logger.business('Super Admin accessing user list', {
        userId: req.user.id,
        filters: { role, status, search, page, limit }
      });

      const result = await superAdminService.getAllUsers({
        role,
        status,
        search,
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder
      }, req.user.id); // Pass current user ID to exclude from results

      return res.json({
        success: true,
        message: 'Users retrieved successfully',
        data: result.users,
        pagination: result.pagination
      });

    } catch (error) {
      logger.error('Failed to get users', {
        userId: req.user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve users',
        error: 'USERS_FETCH_ERROR'
      });
    }
  },

  /**
   * Get detailed user profile
   * GET /api/super-admin/users/:id
   */
  getUserDetails: async (req, res) => {
    const logger = req.logger;

    try {
      const { id } = req.params;
      const { role } = req.query;

      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'User role is required',
          error: 'MISSING_ROLE'
        });
      }

      logger.business('Super Admin accessing user details', {
        userId: req.user.id,
        targetUserId: id,
        targetUserRole: role
      });

      const user = await superAdminService.getUserById(id, role);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      return res.json({
        success: true,
        message: 'User details retrieved successfully',
        data: user
      });

    } catch (error) {
      logger.error('Failed to get user details', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve user details',
        error: 'USER_DETAILS_FETCH_ERROR'
      });
    }
  },

  /**
   * Update user profile
   * PUT /api/super-admin/users/:id
   */
  updateUser: async (req, res) => {
    const logger = req.logger;

    try {
      const { id } = req.params;
      const { role, ...updateData } = req.body;

      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'User role is required',
          error: 'MISSING_ROLE'
        });
      }

      logger.business('Super Admin updating user', {
        userId: req.user.id,
        targetUserId: id,
        targetUserRole: role,
        updateFields: Object.keys(updateData)
      });

      const updatedUser = await superAdminService.updateUser(id, role, updateData);

      return res.json({
        success: true,
        message: 'User updated successfully',
        data: updatedUser
      });

    } catch (error) {
      logger.error('Failed to update user', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      // Handle specific errors
      if (error.code === 'P2025') {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      if (error.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: 'Email already exists',
          error: 'EMAIL_ALREADY_EXISTS'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to update user',
        error: 'USER_UPDATE_ERROR'
      });
    }
  },

  /**
   * Delete user account
   * DELETE /api/super-admin/users/:id
   */
  deleteUser: async (req, res) => {
    const logger = req.logger;

    try {
      const { id } = req.params;
      const { role } = req.query;

      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'User role is required',
          error: 'MISSING_ROLE'
        });
      }

      logger.business('Super Admin deleting user', {
        userId: req.user.id,
        targetUserId: id,
        targetUserRole: role
      });

      await superAdminService.deleteUser(id, role);

      return res.json({
        success: true,
        message: 'User deleted successfully'
      });

    } catch (error) {
      logger.error('Failed to delete user', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      // Handle specific errors
      if (error.code === 'P2025') {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      if (error.message.includes('Cannot delete')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          error: 'DELETION_RESTRICTED'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to delete user',
        error: 'USER_DELETION_ERROR'
      });
    }
  },

  /**
   * Suspend user account
   * POST /api/super-admin/users/:id/suspend
   */
  suspendUser: async (req, res) => {
    const logger = req.logger;

    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'User role is required',
          error: 'MISSING_ROLE'
        });
      }

      logger.business('Super Admin suspending user', {
        userId: req.user.id,
        targetUserId: id,
        targetUserRole: role
      });

      const suspendedUser = await superAdminService.suspendUser(id, role);

      return res.json({
        success: true,
        message: 'User suspended successfully',
        data: suspendedUser
      });

    } catch (error) {
      logger.error('Failed to suspend user', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      // Handle specific errors
      if (error.code === 'P2025') {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      if (error.message.includes('Cannot suspend')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          error: 'SUSPENSION_NOT_ALLOWED'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to suspend user',
        error: 'USER_SUSPENSION_ERROR'
      });
    }
  },

  /**
   * Activate user account
   * POST /api/super-admin/users/:id/activate
   */
  activateUser: async (req, res) => {
    const logger = req.logger;

    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'User role is required',
          error: 'MISSING_ROLE'
        });
      }

      logger.business('Super Admin activating user', {
        userId: req.user.id,
        targetUserId: id,
        targetUserRole: role
      });

      const activatedUser = await superAdminService.activateUser(id, role);

      return res.json({
        success: true,
        message: 'User activated successfully',
        data: activatedUser
      });

    } catch (error) {
      logger.error('Failed to activate user', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      // Handle specific errors
      if (error.code === 'P2025') {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      if (error.message.includes('Super Admin') || error.message.includes('always active')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          error: 'ACTIVATION_NOT_ALLOWED'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to activate user',
        error: 'USER_ACTIVATION_ERROR'
      });
    }
  },

  // ==================== ADVANCED USER OPERATIONS ====================

  /**
   * Force password reset for any user
   * POST /api/super-admin/users/:id/reset-password
   */
  resetUserPassword: async (req, res) => {
    const logger = req.logger;

    try {
      const { id } = req.params;
      const { role, newPassword } = req.body;

      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'User role is required',
          error: 'MISSING_ROLE'
        });
      }

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'New password is required and must be at least 6 characters',
          error: 'INVALID_PASSWORD'
        });
      }

      logger.business('Super Admin resetting user password', {
        userId: req.user.id,
        targetUserId: id,
        targetUserRole: role
      });

      const updatedUser = await superAdminService.resetUserPassword(id, role, newPassword);

      return res.json({
        success: true,
        message: 'Password reset successfully',
        data: updatedUser
      });

    } catch (error) {
      logger.error('Failed to reset user password', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      // Handle specific errors
      if (error.code === 'P2025') {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to reset user password',
        error: 'PASSWORD_RESET_ERROR'
      });
    }
  },

  /**
   * Create impersonation session for user
   * POST /api/super-admin/users/:id/impersonate
   */
  impersonateUser: async (req, res) => {
    const logger = req.logger;

    try {
      const { id } = req.params;
      const { role, reason } = req.body;

      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'User role is required',
          error: 'MISSING_ROLE'
        });
      }

      logger.business('Super Admin creating impersonation session', {
        userId: req.user.id,
        targetUserId: id,
        targetUserRole: role,
        reason: reason || 'No reason provided'
      });

      const impersonationSession = await superAdminService.createImpersonationSession(
        req.user.id,
        id,
        role,
        reason
      );

      return res.json({
        success: true,
        message: 'Impersonation session created successfully',
        data: impersonationSession
      });

    } catch (error) {
      logger.error('Failed to create impersonation session', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      // Handle specific errors
      if (error.code === 'P2025' || error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      if (error.message.includes('Cannot impersonate') || error.message.includes('inactive')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          error: 'IMPERSONATION_NOT_ALLOWED'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to create impersonation session',
        error: 'IMPERSONATION_ERROR'
      });
    }
  },

  /**
   * Get user activity logs
   * GET /api/super-admin/users/:id/activity
   */
  getUserActivity: async (req, res) => {
    const logger = req.logger;

    try {
      const { id } = req.params;
      const { role, limit = 50, page = 1, startDate, endDate } = req.query;

      if (!role) {
        return res.status(400).json({
          success: false,
          message: 'User role is required',
          error: 'MISSING_ROLE'
        });
      }

      logger.business('Super Admin accessing user activity', {
        userId: req.user.id,
        targetUserId: id,
        targetUserRole: role
      });

      const activityData = await superAdminService.getUserActivity(id, role, {
        limit: parseInt(limit),
        page: parseInt(page),
        startDate,
        endDate
      });

      return res.json({
        success: true,
        message: 'User activity retrieved successfully',
        data: activityData
      });

    } catch (error) {
      logger.error('Failed to get user activity', {
        userId: req.user.id,
        targetUserId: req.params.id,
        error: error.message
      });

      // Handle specific errors
      if (error.code === 'P2025' || error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve user activity',
        error: 'ACTIVITY_FETCH_ERROR'
      });
    }
  },

  /**
   * Perform bulk operations on multiple users
   * POST /api/super-admin/bulk-operations
   */
  performBulkOperations: async (req, res) => {
    const logger = req.logger;

    try {
      const { operations } = req.body;

      if (!operations || !Array.isArray(operations) || operations.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Operations array is required and must not be empty',
          error: 'MISSING_OPERATIONS'
        });
      }

      // Validate operations format
      const validActions = ['SUSPEND', 'ACTIVATE', 'UPDATE', 'DELETE', 'RESET_PASSWORD'];
      const validRoles = ['SUPER_ADMIN', 'ADMIN', 'TRAINER', 'CUSTOMER'];

      for (const [index, operation] of operations.entries()) {
        if (!operation.userId || !operation.userRole || !operation.action) {
          return res.status(400).json({
            success: false,
            message: `Operation at index ${index} is missing required fields (userId, userRole, action)`,
            error: 'INVALID_OPERATION_FORMAT'
          });
        }

        if (!validActions.includes(operation.action.toUpperCase())) {
          return res.status(400).json({
            success: false,
            message: `Invalid action '${operation.action}' at index ${index}. Valid actions: ${validActions.join(', ')}`,
            error: 'INVALID_ACTION'
          });
        }

        if (!validRoles.includes(operation.userRole.toUpperCase())) {
          return res.status(400).json({
            success: false,
            message: `Invalid role '${operation.userRole}' at index ${index}. Valid roles: ${validRoles.join(', ')}`,
            error: 'INVALID_ROLE'
          });
        }
      }

      logger.business('Super Admin performing bulk operations', {
        userId: req.user.id,
        operationCount: operations.length,
        operations: operations.map(op => ({
          action: op.action,
          targetRole: op.userRole,
          targetId: op.userId
        }))
      });

      const results = await superAdminService.performBulkUserOperations(operations, req.user.id);

      return res.json({
        success: true,
        message: `Bulk operations completed. ${results.summary.succeeded} succeeded, ${results.summary.failed} failed.`,
        data: results
      });

    } catch (error) {
      logger.error('Failed to perform bulk operations', {
        userId: req.user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to perform bulk operations',
        error: 'BULK_OPERATION_ERROR'
      });
    }
  },

  // ==================== SUBSCRIPTION ADMINISTRATION ====================

  /**
   * Get all subscriptions with comprehensive filtering
   * GET /api/super-admin/subscriptions
   */
  getAllSubscriptions: async (req, res) => {
    const logger = req.logger;

    try {
      const {
        status,
        planType,
        userRole,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = 1,
        limit = 20,
        includeInactive = 'true'
      } = req.query;

      logger.business('Super Admin accessing all subscriptions', {
        userId: req.user.id,
        filters: { status, planType, userRole, search, page, limit }
      });

      const result = await superAdminService.getAllSubscriptions({
        status,
        planType,
        userRole,
        search,
        sortBy,
        sortOrder,
        page: parseInt(page),
        limit: parseInt(limit),
        includeInactive: includeInactive === 'true'
      });

      return res.json({
        success: true,
        message: 'Subscriptions retrieved successfully',
        data: result.subscriptions,
        pagination: result.pagination,
        summary: result.summary
      });

    } catch (error) {
      logger.error('Failed to get all subscriptions', {
        userId: req.user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve subscriptions',
        error: 'SUBSCRIPTIONS_FETCH_ERROR'
      });
    }
  },

  /**
   * Modify subscription details
   * PUT /api/super-admin/subscriptions/:id
   */
  modifySubscription: async (req, res) => {
    const logger = req.logger;

    try {
      const { id } = req.params;
      const modifications = req.body;

      if (!modifications || Object.keys(modifications).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No modifications provided',
          error: 'MISSING_MODIFICATIONS'
        });
      }

      logger.business('Super Admin modifying subscription', {
        userId: req.user.id,
        subscriptionId: id,
        modifications: Object.keys(modifications)
      });

      const result = await superAdminService.modifySubscription(id, modifications, req.user.id);

      return res.json({
        success: true,
        message: 'Subscription modified successfully',
        data: result
      });

    } catch (error) {
      logger.error('Failed to modify subscription', {
        userId: req.user.id,
        subscriptionId: req.params.id,
        error: error.message
      });

      // Handle specific errors
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found',
          error: 'SUBSCRIPTION_NOT_FOUND'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to modify subscription',
        error: 'SUBSCRIPTION_MODIFICATION_ERROR'
      });
    }
  },

  /**
   * Override subscription limits
   * POST /api/super-admin/subscriptions/:id/override
   */
  overrideSubscriptionLimits: async (req, res) => {
    const logger = req.logger;

    try {
      const { id } = req.params;
      const { overrides, reason } = req.body;

      if (!overrides || typeof overrides !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Overrides object is required',
          error: 'MISSING_OVERRIDES'
        });
      }

      logger.business('Super Admin overriding subscription limits', {
        userId: req.user.id,
        subscriptionId: id,
        overrides: Object.keys(overrides),
        reason
      });

      const result = await superAdminService.overrideSubscriptionLimits(
        id,
        overrides,
        req.user.id,
        reason
      );

      return res.json({
        success: true,
        message: 'Subscription limits overridden successfully',
        data: result
      });

    } catch (error) {
      logger.error('Failed to override subscription limits', {
        userId: req.user.id,
        subscriptionId: req.params.id,
        error: error.message
      });

      // Handle specific errors
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found',
          error: 'SUBSCRIPTION_NOT_FOUND'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to override subscription limits',
        error: 'SUBSCRIPTION_OVERRIDE_ERROR'
      });
    }
  },

  /**
   * Get subscriptions with failed payments
   * GET /api/super-admin/subscriptions/failed-payments
   */
  getFailedPaymentSubscriptions: async (req, res) => {
    const logger = req.logger;

    try {
      const {
        limit = 50,
        page = 1,
        daysBack = 30
      } = req.query;

      logger.business('Super Admin accessing failed payment subscriptions', {
        userId: req.user.id,
        filters: { limit, page, daysBack }
      });

      const result = await superAdminService.getFailedPaymentSubscriptions({
        limit: parseInt(limit),
        page: parseInt(page),
        daysBack: parseInt(daysBack)
      });

      return res.json({
        success: true,
        message: 'Failed payment subscriptions retrieved successfully',
        data: result.subscriptions,
        pagination: result.pagination,
        summary: result.summary
      });

    } catch (error) {
      logger.error('Failed to get failed payment subscriptions', {
        userId: req.user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve failed payment subscriptions',
        error: 'FAILED_PAYMENTS_FETCH_ERROR'
      });
    }
  },

  /**
   * Process subscription refund
   * POST /api/super-admin/subscriptions/:id/refund
   */
  processSubscriptionRefund: async (req, res) => {
    const logger = req.logger;

    try {
      const { id } = req.params;
      const { paymentId, amount, reason, refundType } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Refund reason is required',
          error: 'MISSING_REASON'
        });
      }

      logger.business('Super Admin processing subscription refund', {
        userId: req.user.id,
        subscriptionId: id,
        paymentId,
        amount,
        reason,
        refundType
      });

      const result = await superAdminService.processSubscriptionRefund(
        id,
        { paymentId, amount, reason, refundType },
        req.user.id
      );

      return res.json({
        success: true,
        message: 'Refund processed successfully',
        data: result
      });

    } catch (error) {
      logger.error('Failed to process subscription refund', {
        userId: req.user.id,
        subscriptionId: req.params.id,
        error: error.message
      });

      // Handle specific errors
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message,
          error: 'SUBSCRIPTION_OR_PAYMENT_NOT_FOUND'
        });
      }

      if (error.message.includes('Stripe')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          error: 'STRIPE_REFUND_ERROR'
        });
      }

      if (error.message.includes('exceed')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          error: 'INVALID_REFUND_AMOUNT'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to process refund',
        error: 'REFUND_PROCESSING_ERROR'
      });
    }
  },

  // ==================== SYSTEM HEALTH & MONITORING ====================

  /**
   * Get comprehensive system health status
   * GET /api/super-admin/system/health
   */
  getSystemHealth: async (req, res) => {
    const logger = req.logger;

    try {
      logger.business('Super Admin accessing system health', {
        userId: req.user.id
      });

      const healthData = await superAdminService.getSystemHealth();

      return res.json({
        success: true,
        message: 'System health retrieved successfully',
        data: healthData
      });

    } catch (error) {
      logger.error('Failed to get system health', {
        userId: req.user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve system health',
        error: 'SYSTEM_HEALTH_ERROR'
      });
    }
  },

  /**
   * Get system performance metrics
   * GET /api/super-admin/system/metrics
   */
  getSystemMetrics: async (req, res) => {
    const logger = req.logger;

    try {
      logger.business('Super Admin accessing system metrics', {
        userId: req.user.id
      });

      const metrics = await superAdminService.getSystemMetrics();

      return res.json({
        success: true,
        message: 'System metrics retrieved successfully',
        data: metrics
      });

    } catch (error) {
      logger.error('Failed to get system metrics', {
        userId: req.user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve system metrics',
        error: 'SYSTEM_METRICS_ERROR'
      });
    }
  },

  /**
   * Get system logs with filtering
   * GET /api/super-admin/system/logs
   */
  getSystemLogs: async (req, res) => {
    const logger = req.logger;

    try {
      const {
        level = 'all',
        startDate,
        endDate,
        limit = 100,
        category = 'all'
      } = req.query;

      logger.business('Super Admin accessing system logs', {
        userId: req.user.id,
        filters: { level, startDate, endDate, limit, category }
      });

      const logsData = await superAdminService.getSystemLogs({
        level,
        startDate,
        endDate,
        limit: parseInt(limit),
        category
      });

      return res.json({
        success: true,
        message: 'System logs retrieved successfully',
        data: logsData
      });

    } catch (error) {
      logger.error('Failed to get system logs', {
        userId: req.user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve system logs',
        error: 'SYSTEM_LOGS_ERROR'
      });
    }
  },

  /**
   * Get database health and statistics
   * GET /api/super-admin/system/database
   */
  getDatabaseHealth: async (req, res) => {
    const logger = req.logger;

    try {
      logger.business('Super Admin accessing database health', {
        userId: req.user.id
      });

      const dbHealth = await superAdminService.getDatabaseHealth();

      return res.json({
        success: true,
        message: 'Database health retrieved successfully',
        data: dbHealth
      });

    } catch (error) {
      logger.error('Failed to get database health', {
        userId: req.user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve database health',
        error: 'DATABASE_HEALTH_ERROR'
      });
    }
  },

  /**
   * Toggle maintenance mode
   * POST /api/super-admin/system/maintenance
   */
  toggleMaintenanceMode: async (req, res) => {
    const logger = req.logger;

    try {
      const { enabled, reason, scheduledEnd } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Enabled field must be a boolean',
          error: 'INVALID_INPUT'
        });
      }

      logger.business('Super Admin toggling maintenance mode', {
        userId: req.user.id,
        enabled,
        reason
      });

      const result = await superAdminService.toggleMaintenanceMode(
        enabled,
        reason,
        scheduledEnd
      );

      return res.json({
        success: true,
        message: result.message,
        data: result
      });

    } catch (error) {
      logger.error('Failed to toggle maintenance mode', {
        userId: req.user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to toggle maintenance mode',
        error: 'MAINTENANCE_MODE_ERROR'
      });
    }
  }
};