import { PrismaClient } from '../generated/prisma/index.js';
import { log } from '../utils/logger.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export const superAdminService = {
  /**
   * Get comprehensive platform overview statistics
   */
  async getPlatformStats() {
    try {
      // Get current date for analytics
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Execute all queries in parallel for performance
      const [
        totalSuperAdmins,
        totalAdmins,
        totalTrainers,
        totalCustomers,
        activeSubscriptions,
        inactiveSubscriptions,
        totalRevenue,
        monthlyRevenue,
        weeklyRevenue,
        newAdminsThisMonth,
        newTrainersThisMonth,
        newCustomersThisMonth,
        newAdminsThisWeek,
        newTrainersThisWeek,
        newCustomersThisWeek,
        subscriptionsByPlan,
        recentPayments
      ] = await Promise.all([
        // Total user counts by role
        prisma.superAdmin.count(),
        prisma.admin.count({ where: { status: 'ACTIVE' } }),
        prisma.trainer.count({ where: { status: 'ACTIVE' } }),
        prisma.customer.count(),

        // Subscription counts
        prisma.subscription.count({ where: { status: 'ACTIVE' } }),
        prisma.subscription.count({ where: { status: 'INACTIVE' } }),

        // Revenue calculations
        prisma.payment.aggregate({
          where: { status: 'COMPLETED' },
          _sum: { amount: true },
          _count: { id: true }
        }),

        prisma.payment.aggregate({
          where: {
            status: 'COMPLETED',
            createdAt: { gte: thirtyDaysAgo }
          },
          _sum: { amount: true }
        }),

        prisma.payment.aggregate({
          where: {
            status: 'COMPLETED',
            createdAt: { gte: sevenDaysAgo }
          },
          _sum: { amount: true }
        }),

        // User growth analytics - monthly
        prisma.admin.count({
          where: { createdAt: { gte: thirtyDaysAgo } }
        }),

        prisma.trainer.count({
          where: { createdAt: { gte: thirtyDaysAgo } }
        }),

        prisma.customer.count({
          where: { createdAt: { gte: thirtyDaysAgo } }
        }),

        // User growth analytics - weekly
        prisma.admin.count({
          where: { createdAt: { gte: sevenDaysAgo } }
        }),

        prisma.trainer.count({
          where: { createdAt: { gte: sevenDaysAgo } }
        }),

        prisma.customer.count({
          where: { createdAt: { gte: sevenDaysAgo } }
        }),

        // Subscription distribution by plan
        prisma.subscription.groupBy({
          by: ['planId'],
          where: { status: 'ACTIVE' },
          _count: { _all: true }
        }),

        // Recent payment activity
        prisma.payment.findMany({
          where: { status: 'COMPLETED' },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            subscription: {
              include: {
                plan: {
                  select: { name: true, planType: true }
                }
              }
            }
          }
        })
      ]);

      // Get plan details for subscription distribution
      const planDetails = await prisma.subscriptionPlan.findMany({
        where: {
          id: { in: subscriptionsByPlan.map(s => s.planId) }
        },
        select: {
          id: true,
          name: true,
          planType: true,
          price: true
        }
      });

      // Create plan distribution with details
      const planDistribution = subscriptionsByPlan.map(sub => {
        const plan = planDetails.find(p => p.id === sub.planId);
        return {
          planId: sub.planId,
          planName: plan?.name || 'Unknown Plan',
          planType: plan?.planType || 'UNKNOWN',
          price: plan?.price || 0,
          activeSubscriptions: sub._count._all
        };
      });

      // Calculate total users and growth rates
      const totalUsers = totalSuperAdmins + totalAdmins + totalTrainers + totalCustomers;
      const newUsersThisMonth = newAdminsThisMonth + newTrainersThisMonth + newCustomersThisMonth;
      const newUsersThisWeek = newAdminsThisWeek + newTrainersThisWeek + newCustomersThisWeek;

      // Calculate growth rates
      const userGrowthRate = newUsersThisMonth > 0 ?
        ((newUsersThisWeek / (newUsersThisMonth - newUsersThisWeek)) * 100).toFixed(2) : 0;

      // Revenue metrics
      const averageRevenuePerUser = totalUsers > 0 ?
        (totalRevenue._sum.amount || 0) / totalUsers : 0;

      const monthlyRecurringRevenue = monthlyRevenue._sum.amount || 0;

      return {
        overview: {
          totalUsers,
          totalSuperAdmins,
          totalAdmins,
          totalTrainers,
          totalCustomers,
          activeSubscriptions,
          inactiveSubscriptions,
          totalSubscriptions: activeSubscriptions + inactiveSubscriptions
        },
        revenue: {
          totalRevenue: totalRevenue._sum.amount || 0,
          monthlyRevenue: monthlyRecurringRevenue,
          weeklyRevenue: weeklyRevenue._sum.amount || 0,
          averageRevenuePerUser: parseFloat(averageRevenuePerUser.toFixed(2)),
          totalTransactions: totalRevenue._count._all || 0
        },
        growth: {
          newUsersThisMonth,
          newUsersThisWeek,
          userGrowthRate: parseFloat(userGrowthRate),
          breakdown: {
            newAdminsThisMonth,
            newTrainersThisMonth,
            newCustomersThisMonth,
            newAdminsThisWeek,
            newTrainersThisWeek,
            newCustomersThisWeek
          }
        },
        subscriptions: {
          planDistribution,
          totalActive: activeSubscriptions,
          totalInactive: inactiveSubscriptions,
          conversionRate: totalUsers > 0 ?
            ((activeSubscriptions / totalUsers) * 100).toFixed(2) : 0
        },
        recentActivity: {
          recentPayments: recentPayments.map(payment => ({
            id: payment.id,
            amount: payment.amount,
            planName: payment.subscription?.plan?.name || 'Unknown',
            planType: payment.subscription?.plan?.planType || 'UNKNOWN',
            createdAt: payment.createdAt
          }))
        },
        generatedAt: new Date()
      };

    } catch (error) {
      log.error('Failed to get platform statistics', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Failed to retrieve platform statistics');
    }
  },

  /**
   * Get real-time system health metrics
   */
  async getSystemHealth() {
    try {
      const [
        databaseHealth,
        totalActiveUsers
      ] = await Promise.all([
        // Test database connectivity
        prisma.$queryRaw`SELECT 1 as health`,

        // Count total active users across all roles
        Promise.all([
          prisma.superAdmin.count(),
          prisma.admin.count({ where: { status: 'ACTIVE' } }),
          prisma.trainer.count({ where: { status: 'ACTIVE' } })
        ]).then(counts => counts.reduce((sum, count) => sum + count, 0))
      ]);

      return {
        database: {
          status: databaseHealth ? 'healthy' : 'unhealthy',
          connections: 'active'
        },
        users: {
          totalActiveUsers: totalActiveUsers
        },
        server: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version
        },
        timestamp: new Date()
      };

    } catch (error) {
      log.error('Failed to get system health', {
        error: error.message
      });
      throw new Error('Failed to retrieve system health');
    }
  },

  /**
   * Get comprehensive revenue analytics
   */
  async getRevenueAnalytics(timeframe = '12m') {
    try {
      const now = new Date();
      let startDate;

      // Calculate timeframe
      switch (timeframe) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '12m':
        default:
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      }

      const [
        totalRevenue,
        mrrData,
        revenueByPlan,
        revenueBySegment,
        paymentFailures,
        stripeHealth
      ] = await Promise.all([
        this._getTotalRevenue(startDate),
        this._getMRRCalculations(),
        this._getRevenueByPlan(startDate),
        this._getRevenueByUserSegment(startDate),
        this._getPaymentFailureAnalytics(),
        this._getStripeIntegrationHealth()
      ]);

      return {
        overview: totalRevenue,
        mrr: mrrData,
        revenueByPlan,
        revenueBySegment,
        paymentFailures,
        stripeHealth,
        timeframe,
        generatedAt: new Date()
      };
    } catch (error) {
      log.error('Failed to get revenue analytics', { error: error.message });
      throw new Error('Failed to retrieve revenue analytics');
    }
  },

  /**
   * Get total revenue breakdown
   */
  async _getTotalRevenue(startDate) {
    try {
      const previousPeriodStart = new Date(startDate.getTime() - (Date.now() - startDate.getTime()));

      const [currentPeriod, previousPeriod, allTimeRevenue] = await Promise.all([
        // Current period revenue
        prisma.payment.aggregate({
          where: {
            status: 'COMPLETED',
            createdAt: { gte: startDate }
          },
          _sum: { amount: true },
          _count: { _all: true }
        }),

        // Previous period for growth calculation
        prisma.payment.aggregate({
          where: {
            status: 'COMPLETED',
            createdAt: {
              gte: previousPeriodStart,
              lt: startDate
            }
          },
          _sum: { amount: true },
          _count: { _all: true }
        }),

        // All time revenue
        prisma.payment.aggregate({
          where: { status: 'COMPLETED' },
          _sum: { amount: true },
          _count: { _all: true }
        })
      ]);

      const currentRevenue = currentPeriod._sum.amount || 0;
      const previousRevenue = previousPeriod._sum.amount || 0;
      const growthRate = previousRevenue > 0 ?
        (((currentRevenue - previousRevenue) / previousRevenue) * 100).toFixed(2) : 0;

      return {
        totalRevenue: allTimeRevenue._sum.amount || 0,
        currentPeriodRevenue: currentRevenue,
        previousPeriodRevenue: previousRevenue,
        growthRate: parseFloat(growthRate),
        totalTransactions: allTimeRevenue._count._all || 0,
        currentPeriodTransactions: currentPeriod._count._all || 0
      };
    } catch (error) {
      log.error('Failed to get total revenue', { error: error.message });
      throw error;
    }
  },

  /**
   * Calculate Monthly Recurring Revenue (MRR)
   */
  async _getMRRCalculations() {
    try {
      // Get all active subscriptions with their plans
      const activeSubscriptions = await prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
        include: {
          plan: {
            select: { price: true, planType: true }
          }
        }
      });

      // Calculate current MRR
      const currentMRR = activeSubscriptions.reduce((total, sub) => {
        return total + (sub.plan.price || 0);
      }, 0);

      // Get MRR for last 6 months to show trend
      const mrrTrend = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

        const monthlyRevenue = await prisma.payment.aggregate({
          where: {
            status: 'COMPLETED',
            createdAt: {
              gte: monthStart,
              lte: monthEnd
            }
          },
          _sum: { amount: true }
        });

        mrrTrend.push({
          month: monthStart.toISOString().slice(0, 7), // YYYY-MM format
          revenue: monthlyRevenue._sum.amount || 0
        });
      }

      // Calculate MRR growth rate
      const lastMonthMRR = mrrTrend[mrrTrend.length - 2]?.revenue || 0;
      const thisMonthMRR = mrrTrend[mrrTrend.length - 1]?.revenue || 0;
      const mrrGrowthRate = lastMonthMRR > 0 ?
        (((thisMonthMRR - lastMonthMRR) / lastMonthMRR) * 100).toFixed(2) : 0;

      return {
        currentMRR,
        mrrGrowthRate: parseFloat(mrrGrowthRate),
        mrrTrend,
        activeSubscriptionCount: activeSubscriptions.length,
        averageRevenuePerSubscription: activeSubscriptions.length > 0 ?
          (currentMRR / activeSubscriptions.length).toFixed(2) : 0
      };
    } catch (error) {
      log.error('Failed to calculate MRR', { error: error.message });
      throw error;
    }
  },

  /**
   * Get revenue breakdown by subscription plan
   */
  async _getRevenueByPlan(startDate) {
    try {
      // Get payments grouped by subscription plan
      const revenueByPlan = await prisma.payment.findMany({
        where: {
          status: 'COMPLETED',
          createdAt: { gte: startDate }
        },
        include: {
          subscription: {
            include: {
              plan: {
                select: { id: true, name: true, planType: true, price: true }
              }
            }
          }
        }
      });

      // Group and aggregate by plan
      const planRevenue = {};
      revenueByPlan.forEach(payment => {
        const plan = payment.subscription?.plan;
        if (plan) {
          if (!planRevenue[plan.id]) {
            planRevenue[plan.id] = {
              planId: plan.id,
              planName: plan.name,
              planType: plan.planType,
              monthlyPrice: plan.price,
              revenue: 0,
              transactionCount: 0,
              subscriberCount: new Set()
            };
          }
          planRevenue[plan.id].revenue += payment.amount;
          planRevenue[plan.id].transactionCount += 1;
          planRevenue[plan.id].subscriberCount.add(payment.subscription.userId);
        }
      });

      // Convert to array and format
      const planRevenueArray = Object.values(planRevenue).map(plan => ({
        ...plan,
        subscriberCount: plan.subscriberCount.size,
        averageRevenuePerUser: plan.subscriberCount.size > 0 ?
          (plan.revenue / plan.subscriberCount.size).toFixed(2) : 0
      })).sort((a, b) => b.revenue - a.revenue);

      return planRevenueArray;
    } catch (error) {
      log.error('Failed to get revenue by plan', { error: error.message });
      throw error;
    }
  },

  /**
   * Get revenue breakdown by user segments (Admin/Trainer vs Customer)
   */
  async _getRevenueByUserSegment(startDate) {
    try {
      const [adminTrainerRevenue, customerRevenue] = await Promise.all([
        // Admin/Trainer segment revenue
        prisma.payment.aggregate({
          where: {
            status: 'COMPLETED',
            createdAt: { gte: startDate },
            subscription: {
              userType: { in: ['ADMIN', 'TRAINER'] }
            }
          },
          _sum: { amount: true },
          _count: { _all: true }
        }),

        // Customer segment revenue
        prisma.payment.aggregate({
          where: {
            status: 'COMPLETED',
            createdAt: { gte: startDate },
            subscription: {
              userType: 'CUSTOMER'
            }
          },
          _sum: { amount: true },
          _count: { _all: true }
        })
      ]);

      const totalRevenue = (adminTrainerRevenue._sum.amount || 0) + (customerRevenue._sum.amount || 0);

      return {
        adminTrainerSegment: {
          revenue: adminTrainerRevenue._sum.amount || 0,
          transactionCount: adminTrainerRevenue._count._all || 0,
          percentage: totalRevenue > 0 ?
            ((adminTrainerRevenue._sum.amount || 0) / totalRevenue * 100).toFixed(1) : 0
        },
        customerSegment: {
          revenue: customerRevenue._sum.amount || 0,
          transactionCount: customerRevenue._count._all || 0,
          percentage: totalRevenue > 0 ?
            ((customerRevenue._sum.amount || 0) / totalRevenue * 100).toFixed(1) : 0
        },
        totalRevenue
      };
    } catch (error) {
      log.error('Failed to get revenue by user segment', { error: error.message });
      throw error;
    }
  },

  /**
   * Get payment failure analytics
   */
  async _getPaymentFailureAnalytics() {
    try {
      const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [totalPayments, failedPayments, recentFailures] = await Promise.all([
        // Total payment attempts in last 30 days
        prisma.payment.count({
          where: { createdAt: { gte: last30Days } }
        }),

        // Failed payment attempts
        prisma.payment.count({
          where: {
            status: 'FAILED',
            createdAt: { gte: last30Days }
          }
        }),

        // Recent failed payments with details
        prisma.payment.findMany({
          where: {
            status: 'FAILED',
            createdAt: { gte: last30Days }
          },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            subscription: {
              include: {
                plan: { select: { name: true } }
              }
            }
          }
        })
      ]);

      const failureRate = totalPayments > 0 ?
        ((failedPayments / totalPayments) * 100).toFixed(2) : 0;

      // Group failures by reason (if available)
      const failureReasons = {};
      recentFailures.forEach(payment => {
        const reason = payment.failureReason || 'Unknown';
        failureReasons[reason] = (failureReasons[reason] || 0) + 1;
      });

      return {
        failureRate: parseFloat(failureRate),
        totalAttempts: totalPayments,
        failedAttempts: failedPayments,
        successfulPayments: totalPayments - failedPayments,
        failureReasons,
        recentFailures: recentFailures.map(payment => ({
          id: payment.id,
          amount: payment.amount,
          planName: payment.subscription?.plan?.name || 'Unknown',
          failureReason: payment.failureReason || 'Unknown',
          createdAt: payment.createdAt
        }))
      };
    } catch (error) {
      log.error('Failed to get payment failure analytics', { error: error.message });
      throw error;
    }
  },

  /**
   * Monitor Stripe integration health
   */
  async _getStripeIntegrationHealth() {
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [recentWebhooks, recentPayments, webhookFailures] = await Promise.all([
        // Count recent webhook events (if you have webhook logs)
        Promise.resolve(0), // Placeholder - would need webhook log table

        // Recent successful Stripe payments
        prisma.payment.count({
          where: {
            status: 'COMPLETED',
            createdAt: { gte: last24Hours },
            stripePaymentId: { not: null }
          }
        }),

        // Recent webhook processing failures
        Promise.resolve(0) // Placeholder - would need webhook error log
      ]);

      // Simple health check based on recent activity
      const isHealthy = recentPayments > 0 || Date.now() - last24Hours.getTime() < 24 * 60 * 60 * 1000;

      return {
        status: isHealthy ? 'healthy' : 'degraded',
        recentPayments,
        recentWebhooks,
        webhookFailures,
        lastSuccessfulPayment: recentPayments > 0 ? 'Recent' : 'No recent activity',
        apiConnectivity: 'Connected' // Would test actual Stripe API
      };
    } catch (error) {
      log.error('Failed to get Stripe health', { error: error.message });
      return {
        status: 'error',
        error: error.message
      };
    }
  },

  // ==================== USER MANAGEMENT METHODS ====================

  /**
   * Get all users with filtering, pagination, and search
   * @param {Object} filters - Filter options
   * @param {string} currentUserId - Current Super Admin ID to exclude from results
   */
  async getAllUsers(filters = {}, currentUserId = null) {
    try {
      const {
        role,
        status,
        search,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      const offset = (page - 1) * limit;
      const orderBy = { [sortBy]: sortOrder };

      // Build base query conditions
      let whereConditions = [];

      // Role-based filtering
      if (role) {
        const roleCondition = { role: role.toUpperCase() };
        whereConditions.push(roleCondition);
      }

      // Search across multiple fields
      if (search) {
        const searchConditions = [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } }
        ];
        whereConditions.push({ OR: searchConditions });
      }

      // Status filtering (for admins and trainers)
      if (status) {
        whereConditions.push({ status: status.toUpperCase() });
      }

      const whereClause = whereConditions.length > 0 ? { AND: whereConditions } : {};

      // Get users from all role tables
      const [superAdmins, admins, trainers, customers] = await Promise.all([
        // Super Admins (exclude current user)
        prisma.superAdmin.findMany({
          where: {
            ...whereClause,
            // Exclude current Super Admin from results
            ...(currentUserId ? { id: { not: currentUserId } } : {}),
            ...(role && role.toUpperCase() === 'SUPER_ADMIN' ? {} : role ? { id: null } : {})
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy,
          skip: role === 'SUPER_ADMIN' ? offset : 0,
          take: role === 'SUPER_ADMIN' ? limit : undefined
        }),

        // Admins
        prisma.admin.findMany({
          where: {
            ...whereClause,
            ...(role && role.toUpperCase() === 'ADMIN' ? {} : role ? { id: null } : {})
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            superAdminId: true
          },
          orderBy,
          skip: role === 'ADMIN' ? offset : 0,
          take: role === 'ADMIN' ? limit : undefined
        }),

        // Trainers
        prisma.trainer.findMany({
          where: {
            ...whereClause,
            ...(role && role.toUpperCase() === 'TRAINER' ? {} : role ? { id: null } : {})
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            adminId: true
          },
          orderBy,
          skip: role === 'TRAINER' ? offset : 0,
          take: role === 'TRAINER' ? limit : undefined
        }),

        // Customers
        prisma.customer.findMany({
          where: {
            ...whereClause,
            ...(role && role.toUpperCase() === 'CUSTOMER' ? {} : role ? { id: null } : {})
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            updatedAt: true,
            trainerId: true
          },
          orderBy,
          skip: role === 'CUSTOMER' ? offset : 0,
          take: role === 'CUSTOMER' ? limit : undefined
        })
      ]);

      // Combine and format results
      let allUsers = [
        ...superAdmins.map(user => ({ ...user, role: 'SUPER_ADMIN', status: 'ACTIVE' })),
        ...admins.map(user => ({ ...user, role: 'ADMIN' })),
        ...trainers.map(user => ({ ...user, role: 'TRAINER' })),
        ...customers.map(user => ({ ...user, role: 'CUSTOMER', status: 'ACTIVE' }))
      ];

      // If no role filter, apply pagination to combined results
      if (!role) {
        allUsers = allUsers
          .sort((a, b) => {
            if (sortBy === 'createdAt') {
              return sortOrder === 'desc'
                ? new Date(b.createdAt) - new Date(a.createdAt)
                : new Date(a.createdAt) - new Date(b.createdAt);
            }
            return 0;
          })
          .slice(offset, offset + limit);
      }

      // Get total count for pagination (exclude current user from Super Admin count)
      const totalCounts = await Promise.all([
        role === 'SUPER_ADMIN' || !role ? prisma.superAdmin.count({
          where: {
            ...whereClause,
            ...(currentUserId ? { id: { not: currentUserId } } : {})
          }
        }) : Promise.resolve(0),
        role === 'ADMIN' || !role ? prisma.admin.count({ where: whereClause }) : Promise.resolve(0),
        role === 'TRAINER' || !role ? prisma.trainer.count({ where: whereClause }) : Promise.resolve(0),
        role === 'CUSTOMER' || !role ? prisma.customer.count({ where: whereClause }) : Promise.resolve(0)
      ]);

      const totalUsers = totalCounts.reduce((sum, count) => sum + count, 0);
      const totalPages = Math.ceil(totalUsers / limit);

      return {
        users: allUsers,
        pagination: {
          currentPage: page,
          totalPages,
          totalUsers,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      };
    } catch (error) {
      log.error('Failed to get all users', { error: error.message, filters });
      throw error;
    }
  },

  /**
   * Get detailed user profile by ID and role
   */
  async getUserById(userId, userRole) {
    try {
      let user = null;
      let additionalData = {};

      switch (userRole.toUpperCase()) {
        case 'SUPER_ADMIN':
          user = await prisma.superAdmin.findUnique({
            where: { id: userId },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              createdAt: true,
              updatedAt: true,
              // Get managed admins
              admins: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  status: true
                }
              }
            }
          });
          if (user) {
            additionalData.role = 'SUPER_ADMIN';
            additionalData.status = 'ACTIVE';
            additionalData.managedAdmins = user.admins;
            delete user.admins;
          }
          break;

        case 'ADMIN':
          user = await prisma.admin.findUnique({
            where: { id: userId },
            include: {
              superAdmin: {
                select: { id: true, email: true, firstName: true, lastName: true }
              },
              trainers: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  status: true
                }
              },
              subscription: {
                include: {
                  plan: true
                }
              }
            }
          });
          if (user) {
            additionalData.role = 'ADMIN';
            additionalData.managedBy = user.superAdmin;
            additionalData.managedTrainers = user.trainers;
            additionalData.subscription = user.subscription;
            delete user.superAdmin;
            delete user.trainers;
            delete user.subscription;
          }
          break;

        case 'TRAINER':
          user = await prisma.trainer.findUnique({
            where: { id: userId },
            include: {
              admin: {
                select: { id: true, email: true, firstName: true, lastName: true }
              },
              customers: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true
                }
              },
              subscription: {
                include: {
                  plan: true
                }
              }
            }
          });
          if (user) {
            additionalData.role = 'TRAINER';
            additionalData.managedBy = user.admin;
            additionalData.managedCustomers = user.customers;
            additionalData.subscription = user.subscription;
            delete user.admin;
            delete user.customers;
            delete user.subscription;
          }
          break;

        case 'CUSTOMER':
          user = await prisma.customer.findUnique({
            where: { id: userId },
            include: {
              trainer: {
                select: { id: true, email: true, firstName: true, lastName: true }
              },
              subscription: {
                include: {
                  plan: true
                }
              }
            }
          });
          if (user) {
            additionalData.role = 'CUSTOMER';
            additionalData.status = 'ACTIVE';
            additionalData.assignedTrainer = user.trainer;
            additionalData.subscription = user.subscription;
            delete user.trainer;
            delete user.subscription;
          }
          break;

        default:
          throw new Error(`Invalid user role: ${userRole}`);
      }

      if (!user) {
        return null;
      }

      return { ...user, ...additionalData };
    } catch (error) {
      log.error('Failed to get user by ID', { error: error.message, userId, userRole });
      throw error;
    }
  },

  /**
   * Update user profile
   */
  async updateUser(userId, userRole, updateData) {
    try {
      const { email, firstName, lastName, status, ...otherFields } = updateData;

      let updatedUser = null;

      switch (userRole.toUpperCase()) {
        case 'SUPER_ADMIN':
          updatedUser = await prisma.superAdmin.update({
            where: { id: userId },
            data: {
              ...(email && { email }),
              ...(firstName && { firstName }),
              ...(lastName && { lastName }),
              updatedAt: new Date()
            }
          });
          break;

        case 'ADMIN':
          updatedUser = await prisma.admin.update({
            where: { id: userId },
            data: {
              ...(email && { email }),
              ...(firstName && { firstName }),
              ...(lastName && { lastName }),
              ...(status && { status: status.toUpperCase() }),
              updatedAt: new Date()
            }
          });
          break;

        case 'TRAINER':
          updatedUser = await prisma.trainer.update({
            where: { id: userId },
            data: {
              ...(email && { email }),
              ...(firstName && { firstName }),
              ...(lastName && { lastName }),
              ...(status && { status: status.toUpperCase() }),
              updatedAt: new Date()
            }
          });
          break;

        case 'CUSTOMER':
          updatedUser = await prisma.customer.update({
            where: { id: userId },
            data: {
              ...(email && { email }),
              ...(firstName && { firstName }),
              ...(lastName && { lastName }),
              updatedAt: new Date()
            }
          });
          break;

        default:
          throw new Error(`Invalid user role: ${userRole}`);
      }

      log.info('User updated successfully', { userId, userRole, updatedFields: Object.keys(updateData) });
      return updatedUser;
    } catch (error) {
      log.error('Failed to update user', { error: error.message, userId, userRole });
      throw error;
    }
  },

  /**
   * Delete user with cascade
   */
  async deleteUser(userId, userRole) {
    try {
      let deletedUser = null;

      switch (userRole.toUpperCase()) {
        case 'SUPER_ADMIN':
          // Cannot delete super admin if they manage other admins
          const managedAdmins = await prisma.admin.count({
            where: { superAdminId: userId }
          });

          if (managedAdmins > 0) {
            throw new Error('Cannot delete Super Admin who manages other Admins. Please reassign or delete managed Admins first.');
          }

          deletedUser = await prisma.superAdmin.delete({
            where: { id: userId }
          });
          break;

        case 'ADMIN':
          // Check for managed trainers
          const managedTrainers = await prisma.trainer.count({
            where: { adminId: userId }
          });

          if (managedTrainers > 0) {
            throw new Error('Cannot delete Admin who manages Trainers. Please reassign or delete managed Trainers first.');
          }

          // Delete associated subscription and payments
          await prisma.$transaction(async (tx) => {
            // Delete payments first
            await tx.payment.deleteMany({
              where: {
                subscription: {
                  OR: [
                    { adminId: userId },
                    { trainerId: null, customerId: null, adminId: userId }
                  ]
                }
              }
            });

            // Delete subscription
            await tx.subscription.deleteMany({
              where: { adminId: userId }
            });

            // Delete admin
            deletedUser = await tx.admin.delete({
              where: { id: userId }
            });
          });
          break;

        case 'TRAINER':
          // Check for managed customers
          const managedCustomers = await prisma.customer.count({
            where: { trainerId: userId }
          });

          if (managedCustomers > 0) {
            throw new Error('Cannot delete Trainer who manages Customers. Please reassign or delete managed Customers first.');
          }

          // Delete associated subscription and payments
          await prisma.$transaction(async (tx) => {
            // Delete payments
            await tx.payment.deleteMany({
              where: {
                subscription: { trainerId: userId }
              }
            });

            // Delete subscription
            await tx.subscription.deleteMany({
              where: { trainerId: userId }
            });

            // Delete trainer
            deletedUser = await tx.trainer.delete({
              where: { id: userId }
            });
          });
          break;

        case 'CUSTOMER':
          // Delete customer and associated data
          await prisma.$transaction(async (tx) => {
            // Delete payments
            await tx.payment.deleteMany({
              where: {
                subscription: { customerId: userId }
              }
            });

            // Delete subscription
            await tx.subscription.deleteMany({
              where: { customerId: userId }
            });

            // Delete customer
            deletedUser = await tx.customer.delete({
              where: { id: userId }
            });
          });
          break;

        default:
          throw new Error(`Invalid user role: ${userRole}`);
      }

      log.info('User deleted successfully', { userId, userRole });
      return deletedUser;
    } catch (error) {
      log.error('Failed to delete user', { error: error.message, userId, userRole });
      throw error;
    }
  },

  /**
   * Suspend user account
   */
  async suspendUser(userId, userRole) {
    try {
      let suspendedUser = null;

      switch (userRole.toUpperCase()) {
        case 'SUPER_ADMIN':
          throw new Error('Cannot suspend Super Admin accounts');

        case 'ADMIN':
          suspendedUser = await prisma.admin.update({
            where: { id: userId },
            data: {
              status: 'INACTIVE',
              updatedAt: new Date()
            }
          });
          break;

        case 'TRAINER':
          suspendedUser = await prisma.trainer.update({
            where: { id: userId },
            data: {
              status: 'INACTIVE',
              updatedAt: new Date()
            }
          });
          break;

        case 'CUSTOMER':
          throw new Error('Customer accounts cannot be suspended directly. Use subscription management instead.');

        default:
          throw new Error(`Invalid user role: ${userRole}`);
      }

      log.info('User suspended successfully', { userId, userRole });
      return suspendedUser;
    } catch (error) {
      log.error('Failed to suspend user', { error: error.message, userId, userRole });
      throw error;
    }
  },

  /**
   * Activate user account
   */
  async activateUser(userId, userRole) {
    try {
      let activatedUser = null;

      switch (userRole.toUpperCase()) {
        case 'SUPER_ADMIN':
          throw new Error('Super Admin accounts are always active');

        case 'ADMIN':
          activatedUser = await prisma.admin.update({
            where: { id: userId },
            data: {
              status: 'ACTIVE',
              updatedAt: new Date()
            }
          });
          break;

        case 'TRAINER':
          activatedUser = await prisma.trainer.update({
            where: { id: userId },
            data: {
              status: 'ACTIVE',
              updatedAt: new Date()
            }
          });
          break;

        case 'CUSTOMER':
          throw new Error('Customer accounts are always active. Use subscription management instead.');

        default:
          throw new Error(`Invalid user role: ${userRole}`);
      }

      log.info('User activated successfully', { userId, userRole });
      return activatedUser;
    } catch (error) {
      log.error('Failed to activate user', { error: error.message, userId, userRole });
      throw error;
    }
  },

  // ==================== ADVANCED USER OPERATIONS ====================

  /**
   * Force password reset for any user
   */
  async resetUserPassword(userId, userRole, newPassword) {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      let updatedUser = null;

      switch (userRole.toUpperCase()) {
        case 'SUPER_ADMIN':
          updatedUser = await prisma.superAdmin.update({
            where: { id: userId },
            data: {
              password: hashedPassword,
              updatedAt: new Date()
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              updatedAt: true
            }
          });
          break;

        case 'ADMIN':
          updatedUser = await prisma.admin.update({
            where: { id: userId },
            data: {
              password: hashedPassword,
              updatedAt: new Date()
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              status: true,
              updatedAt: true
            }
          });
          break;

        case 'TRAINER':
          updatedUser = await prisma.trainer.update({
            where: { id: userId },
            data: {
              password: hashedPassword,
              updatedAt: new Date()
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              status: true,
              updatedAt: true
            }
          });
          break;

        case 'CUSTOMER':
          updatedUser = await prisma.customer.update({
            where: { id: userId },
            data: {
              password: hashedPassword,
              updatedAt: new Date()
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              updatedAt: true
            }
          });
          break;

        default:
          throw new Error(`Invalid user role: ${userRole}`);
      }

      log.info('Password reset successfully', { userId, userRole });
      return updatedUser;
    } catch (error) {
      log.error('Failed to reset password', { error: error.message, userId, userRole });
      throw error;
    }
  },

  /**
   * Create impersonation token for user (with full audit trail)
   */
  async createImpersonationSession(impersonatorId, targetUserId, targetUserRole, reason = '') {
    try {
      // First, verify the target user exists and get their details
      let targetUser = null;

      switch (targetUserRole.toUpperCase()) {
        case 'SUPER_ADMIN':
          throw new Error('Cannot impersonate Super Admin accounts');

        case 'ADMIN':
          targetUser = await prisma.admin.findUnique({
            where: { id: targetUserId },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              status: true
            }
          });
          break;

        case 'TRAINER':
          targetUser = await prisma.trainer.findUnique({
            where: { id: targetUserId },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              status: true
            }
          });
          break;

        case 'CUSTOMER':
          targetUser = await prisma.customer.findUnique({
            where: { id: targetUserId },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          });
          break;

        default:
          throw new Error(`Invalid user role: ${targetUserRole}`);
      }

      if (!targetUser) {
        throw new Error('Target user not found');
      }

      // Check if user is active (for roles that have status)
      if (targetUser.status && targetUser.status !== 'ACTIVE') {
        throw new Error('Cannot impersonate inactive user');
      }

      // Create audit log entry for impersonation
      const auditLog = {
        impersonatorId,
        targetUserId,
        targetUserRole: targetUserRole.toUpperCase(),
        targetUserEmail: targetUser.email,
        reason: reason || 'No reason provided',
        sessionStarted: new Date(),
        status: 'ACTIVE'
      };

      // For now, we'll just return the impersonation data
      // In a full implementation, you might want to create an ImpersonationSession table
      log.info('Impersonation session created', auditLog);

      return {
        impersonationToken: `imp_${targetUserId}_${Date.now()}`, // Simple token for demo
        targetUser: {
          ...targetUser,
          role: targetUserRole.toUpperCase()
        },
        sessionData: auditLog,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours
      };
    } catch (error) {
      log.error('Failed to create impersonation session', {
        error: error.message,
        impersonatorId,
        targetUserId,
        targetUserRole
      });
      throw error;
    }
  },

  /**
   * Get user activity logs (placeholder - would require activity tracking table)
   */
  async getUserActivity(userId, userRole, filters = {}) {
    try {
      const { limit = 50, page = 1, startDate, endDate } = filters;
      const offset = (page - 1) * limit;

      // For now, we'll simulate activity logs using existing data
      // In a real implementation, you'd have an ActivityLog table

      let user = null;
      let activities = [];

      switch (userRole.toUpperCase()) {
        case 'SUPER_ADMIN':
          user = await prisma.superAdmin.findUnique({
            where: { id: userId },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              createdAt: true,
              updatedAt: true
            }
          });
          break;

        case 'ADMIN':
          user = await prisma.admin.findUnique({
            where: { id: userId },
            include: {
              subscription: {
                include: {
                  payments: {
                    orderBy: { createdAt: 'desc' },
                    take: 10
                  }
                }
              }
            }
          });

          if (user?.subscription?.payments) {
            activities = user.subscription.payments.map(payment => ({
              id: payment.id,
              type: 'PAYMENT',
              action: payment.status === 'COMPLETED' ? 'Payment Successful' : 'Payment Failed',
              amount: payment.amount,
              timestamp: payment.createdAt,
              metadata: {
                stripePaymentId: payment.stripePaymentId,
                subscriptionId: payment.subscriptionId
              }
            }));
          }
          break;

        case 'TRAINER':
          user = await prisma.trainer.findUnique({
            where: { id: userId },
            include: {
              subscription: {
                include: {
                  payments: {
                    orderBy: { createdAt: 'desc' },
                    take: 10
                  }
                }
              }
            }
          });

          if (user?.subscription?.payments) {
            activities = user.subscription.payments.map(payment => ({
              id: payment.id,
              type: 'PAYMENT',
              action: payment.status === 'COMPLETED' ? 'Payment Successful' : 'Payment Failed',
              amount: payment.amount,
              timestamp: payment.createdAt,
              metadata: {
                stripePaymentId: payment.stripePaymentId,
                subscriptionId: payment.subscriptionId
              }
            }));
          }
          break;

        case 'CUSTOMER':
          user = await prisma.customer.findUnique({
            where: { id: userId },
            include: {
              subscription: {
                include: {
                  payments: {
                    orderBy: { createdAt: 'desc' },
                    take: 10
                  }
                }
              }
            }
          });

          if (user?.subscription?.payments) {
            activities = user.subscription.payments.map(payment => ({
              id: payment.id,
              type: 'PAYMENT',
              action: payment.status === 'COMPLETED' ? 'Payment Successful' : 'Payment Failed',
              amount: payment.amount,
              timestamp: payment.createdAt,
              metadata: {
                stripePaymentId: payment.stripePaymentId,
                subscriptionId: payment.subscriptionId
              }
            }));
          }
          break;

        default:
          throw new Error(`Invalid user role: ${userRole}`);
      }

      if (!user) {
        throw new Error('User not found');
      }

      // Add account creation activity
      activities.unshift({
        id: `account_created_${user.id}`,
        type: 'ACCOUNT',
        action: 'Account Created',
        timestamp: user.createdAt,
        metadata: {
          email: user.email,
          role: userRole.toUpperCase()
        }
      });

      // Add account update activities if different from creation
      if (user.updatedAt.getTime() !== user.createdAt.getTime()) {
        activities.unshift({
          id: `account_updated_${user.id}`,
          type: 'ACCOUNT',
          action: 'Profile Updated',
          timestamp: user.updatedAt,
          metadata: {
            email: user.email
          }
        });
      }

      // Filter by date range if provided
      if (startDate || endDate) {
        activities = activities.filter(activity => {
          const activityDate = new Date(activity.timestamp);
          if (startDate && activityDate < new Date(startDate)) return false;
          if (endDate && activityDate > new Date(endDate)) return false;
          return true;
        });
      }

      // Apply pagination
      const totalActivities = activities.length;
      activities = activities.slice(offset, offset + limit);

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: userRole.toUpperCase()
        },
        activities,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalActivities / limit),
          totalActivities,
          hasNextPage: offset + limit < totalActivities,
          hasPreviousPage: page > 1
        }
      };
    } catch (error) {
      log.error('Failed to get user activity', { error: error.message, userId, userRole });
      throw error;
    }
  },

  /**
   * Perform bulk operations on multiple users
   */
  async performBulkUserOperations(operations, performedBy) {
    try {
      const results = {
        successful: [],
        failed: [],
        summary: {
          total: operations.length,
          succeeded: 0,
          failed: 0
        }
      };

      for (const operation of operations) {
        const { userId, userRole, action, data } = operation;

        try {
          let result = null;

          switch (action.toUpperCase()) {
            case 'SUSPEND':
              result = await this.suspendUser(userId, userRole);
              break;

            case 'ACTIVATE':
              result = await this.activateUser(userId, userRole);
              break;

            case 'UPDATE':
              result = await this.updateUser(userId, userRole, data);
              break;

            case 'DELETE':
              result = await this.deleteUser(userId, userRole);
              break;

            case 'RESET_PASSWORD':
              if (!data?.newPassword) {
                throw new Error('New password is required for password reset');
              }
              result = await this.resetUserPassword(userId, userRole, data.newPassword);
              break;

            default:
              throw new Error(`Invalid bulk operation action: ${action}`);
          }

          results.successful.push({
            userId,
            userRole,
            action,
            result,
            timestamp: new Date()
          });
          results.summary.succeeded++;

        } catch (error) {
          results.failed.push({
            userId,
            userRole,
            action,
            error: error.message,
            timestamp: new Date()
          });
          results.summary.failed++;
        }
      }

      // Log the bulk operation
      log.info('Bulk user operation completed', {
        performedBy,
        total: results.summary.total,
        succeeded: results.summary.succeeded,
        failed: results.summary.failed
      });

      return results;
    } catch (error) {
      log.error('Failed to perform bulk operations', { error: error.message, performedBy });
      throw error;
    }
  }
};