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
  }
};