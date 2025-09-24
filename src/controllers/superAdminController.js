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
  }
};