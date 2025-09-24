import { PrismaClient, Prisma } from '../generated/prisma/index.js';
import { log } from '../utils/logger.js';
import bcrypt from 'bcrypt';
import Stripe from 'stripe';

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
            // Delete payments for subscriptions belonging to this admin
            await tx.payment.deleteMany({
              where: {
                subscription: { userId: userId }
              }
            });

            // Delete subscription for this admin
            await tx.subscription.deleteMany({
              where: { userId: userId }
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
            // Delete payments for subscriptions belonging to this trainer
            await tx.payment.deleteMany({
              where: {
                subscription: { userId: userId }
              }
            });

            // Delete subscription for this trainer
            await tx.subscription.deleteMany({
              where: { userId: userId }
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
            // Delete payments for subscriptions belonging to this customer
            await tx.payment.deleteMany({
              where: {
                subscription: { userId: userId }
              }
            });

            // Delete subscription for this customer
            await tx.subscription.deleteMany({
              where: { userId: userId }
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
  },

  // ==================== SUBSCRIPTION ADMINISTRATION ====================

  /**
   * Get all subscriptions with comprehensive filtering and analytics
   */
  async getAllSubscriptions(filters = {}) {
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
        includeInactive = true
      } = filters;

      const offset = (page - 1) * limit;
      const orderBy = { [sortBy]: sortOrder };

      // Build where conditions
      let whereConditions = [];

      if (status) {
        whereConditions.push({ status: status.toUpperCase() });
      }

      if (!includeInactive) {
        whereConditions.push({ status: 'ACTIVE' });
      }

      if (planType) {
        whereConditions.push({
          plan: {
            planType: planType.toUpperCase()
          }
        });
      }

      // User role filtering
      if (userRole) {
        whereConditions.push({
          userType: userRole.toUpperCase()
        });
      }

      const whereClause = whereConditions.length > 0 ? { AND: whereConditions } : {};

      // Get subscriptions with full details
      const [subscriptions, totalCount] = await Promise.all([
        prisma.subscription.findMany({
          where: whereClause,
          include: {
            plan: true,
            payments: {
              select: {
                id: true,
                amount: true,
                status: true,
                createdAt: true,
                stripePaymentId: true
              },
              orderBy: { createdAt: 'desc' },
              take: 3
            }
          },
          orderBy,
          skip: offset,
          take: limit
        }),

        prisma.subscription.count({ where: whereClause })
      ]);

      // Get user details for each subscription
      const subscriptionsWithUsers = await Promise.all(
        subscriptions.map(async (sub) => {
          let user = null;

          // Fetch user details based on userType
          switch (sub.userType) {
            case 'ADMIN':
              user = await prisma.admin.findUnique({
                where: { id: sub.userId },
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
              user = await prisma.trainer.findUnique({
                where: { id: sub.userId },
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
              user = await prisma.customer.findUnique({
                where: { id: sub.userId },
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true
                }
              });
              break;
          }

          return { ...sub, userData: user };
        })
      );

      // If search is provided, filter results
      let filteredSubscriptions = subscriptionsWithUsers;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredSubscriptions = subscriptionsWithUsers.filter(sub => {
          const user = sub.userData;
          if (!user) return false;

          return (
            user.email?.toLowerCase().includes(searchLower) ||
            user.firstName?.toLowerCase().includes(searchLower) ||
            user.lastName?.toLowerCase().includes(searchLower) ||
            sub.plan.name?.toLowerCase().includes(searchLower)
          );
        });
      }

      // Format the results
      const formattedSubscriptions = filteredSubscriptions.map(sub => {
        return {
          id: sub.id,
          status: sub.status,
          plan: {
            id: sub.plan.id,
            name: sub.plan.name,
            planType: sub.plan.planType,
            price: sub.plan.price,
            maxCustomers: sub.plan.maxCustomers
          },
          user: {
            id: sub.userData?.id,
            email: sub.userData?.email,
            firstName: sub.userData?.firstName,
            lastName: sub.userData?.lastName,
            role: sub.userType,
            status: sub.userData?.status || 'ACTIVE'
          },
          billing: {
            stripeCustomerId: sub.stripeCustomerId,
            stripeSubscriptionId: sub.stripeSubscriptionId,
            currentPeriodStart: sub.currentPeriodStart,
            currentPeriodEnd: sub.currentPeriodEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd
          },
          recentPayments: sub.payments,
          createdAt: sub.createdAt,
          updatedAt: sub.updatedAt
        };
      });

      const totalPages = Math.ceil(totalCount / limit);

      return {
        subscriptions: formattedSubscriptions,
        pagination: {
          currentPage: page,
          totalPages,
          totalSubscriptions: totalCount,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        },
        summary: {
          total: totalCount,
          active: subscriptions.filter(s => s.status === 'ACTIVE').length,
          inactive: subscriptions.filter(s => s.status === 'INACTIVE').length,
          cancelled: subscriptions.filter(s => s.cancelAtPeriodEnd).length
        }
      };
    } catch (error) {
      log.error('Failed to get all subscriptions', { error: error.message, filters });
      throw error;
    }
  },

  /**
   * Modify subscription details (plan, status, billing)
   */
  async modifySubscription(subscriptionId, modifications, modifiedBy) {
    try {
      const { planId, status, customLimits, cancelAtPeriodEnd } = modifications;

      // Get current subscription
      const currentSubscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          plan: true
        }
      });

      if (!currentSubscription) {
        throw new Error('Subscription not found');
      }

      // Get user details based on userType
      let user = null;
      switch (currentSubscription.userType) {
        case 'ADMIN':
          user = await prisma.admin.findUnique({
            where: { id: currentSubscription.userId },
            select: { email: true, firstName: true, lastName: true }
          });
          break;
        case 'TRAINER':
          user = await prisma.trainer.findUnique({
            where: { id: currentSubscription.userId },
            select: { email: true, firstName: true, lastName: true }
          });
          break;
        case 'CUSTOMER':
          user = await prisma.customer.findUnique({
            where: { id: currentSubscription.userId },
            select: { email: true, firstName: true, lastName: true }
          });
          break;
      }

      let updateData = {
        updatedAt: new Date()
      };

      // Handle plan change
      if (planId && planId !== currentSubscription.planId) {
        const newPlan = await prisma.subscriptionPlan.findUnique({
          where: { id: planId }
        });

        if (!newPlan) {
          throw new Error('New plan not found');
        }

        updateData.planId = planId;

        // If there's a Stripe subscription, update it
        if (currentSubscription.stripeSubscriptionId) {
          try {
            await stripe.subscriptions.update(currentSubscription.stripeSubscriptionId, {
              items: [{
                id: currentSubscription.stripeSubscriptionId,
                price: newPlan.stripePriceId
              }]
            });
          } catch (stripeError) {
            log.warn('Failed to update Stripe subscription', {
              stripeError: stripeError.message,
              subscriptionId
            });
            // Continue with database update even if Stripe fails
          }
        }
      }

      // Handle status change
      if (status && status !== currentSubscription.status) {
        updateData.status = status.toUpperCase();
      }

      // Handle cancellation setting
      if (typeof cancelAtPeriodEnd === 'boolean') {
        updateData.cancelAtPeriodEnd = cancelAtPeriodEnd;

        // Update Stripe subscription
        if (currentSubscription.stripeSubscriptionId) {
          try {
            await stripe.subscriptions.update(currentSubscription.stripeSubscriptionId, {
              cancel_at_period_end: cancelAtPeriodEnd
            });
          } catch (stripeError) {
            log.warn('Failed to update Stripe cancellation', {
              stripeError: stripeError.message,
              subscriptionId
            });
          }
        }
      }

      // Handle custom limits (stored as JSON)
      if (customLimits) {
        updateData.metadata = JSON.stringify({
          ...((currentSubscription.metadata && typeof currentSubscription.metadata === 'string')
            ? JSON.parse(currentSubscription.metadata)
            : {}),
          customLimits
        });
      }

      // Update subscription
      const updatedSubscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: updateData,
        include: {
          plan: true,
          admin: { select: { id: true, email: true, firstName: true, lastName: true } },
          trainer: { select: { id: true, email: true, firstName: true, lastName: true } },
          customer: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      // Log the modification
      log.info('Subscription modified', {
        modifiedBy,
        subscriptionId,
        userEmail: user?.email,
        modifications: Object.keys(modifications),
        oldPlan: currentSubscription.plan.name,
        newPlan: updatedSubscription.plan.name
      });

      return {
        subscription: updatedSubscription,
        changes: modifications,
        user: updatedSubscription.admin || updatedSubscription.trainer || updatedSubscription.customer
      };
    } catch (error) {
      log.error('Failed to modify subscription', { error: error.message, subscriptionId, modifiedBy });
      throw error;
    }
  },

  /**
   * Override subscription limits (for special cases)
   */
  async overrideSubscriptionLimits(subscriptionId, overrides, overriddenBy, reason) {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          plan: true,
          admin: { select: { email: true } },
          trainer: { select: { email: true } },
          customer: { select: { email: true } }
        }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const user = subscription.admin || subscription.trainer || subscription.customer;

      // Prepare override metadata
      const existingMetadata = subscription.metadata && typeof subscription.metadata === 'string'
        ? JSON.parse(subscription.metadata)
        : {};

      const newMetadata = {
        ...existingMetadata,
        overrides: {
          ...overrides,
          appliedBy: overriddenBy,
          appliedAt: new Date().toISOString(),
          reason: reason || 'No reason provided',
          originalLimits: {
            maxCustomers: subscription.plan.maxCustomers
          }
        }
      };

      // Update subscription with overrides
      const updatedSubscription = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          metadata: JSON.stringify(newMetadata),
          updatedAt: new Date()
        },
        include: {
          plan: true,
          admin: { select: { id: true, email: true, firstName: true, lastName: true } },
          trainer: { select: { id: true, email: true, firstName: true, lastName: true } },
          customer: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      });

      // Log the override
      log.info('Subscription limits overridden', {
        overriddenBy,
        subscriptionId,
        userEmail: user?.email,
        overrides,
        reason
      });

      return {
        subscription: updatedSubscription,
        overrides: newMetadata.overrides,
        effectiveLimits: {
          maxCustomers: overrides.maxCustomers || subscription.plan.maxCustomers,
          ...overrides
        }
      };
    } catch (error) {
      log.error('Failed to override subscription limits', {
        error: error.message,
        subscriptionId,
        overriddenBy
      });
      throw error;
    }
  },

  /**
   * Get subscriptions with failed payments
   */
  async getFailedPaymentSubscriptions(filters = {}) {
    try {
      const { limit = 50, page = 1, daysBack = 30 } = filters;
      const offset = (page - 1) * limit;
      const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

      // Get subscriptions with recent failed payments
      const subscriptionsWithFailures = await prisma.subscription.findMany({
        where: {
          payments: {
            some: {
              status: 'FAILED',
              createdAt: { gte: cutoffDate }
            }
          }
        },
        include: {
          plan: true,
          payments: {
            where: {
              status: 'FAILED',
              createdAt: { gte: cutoffDate }
            },
            orderBy: { createdAt: 'desc' }
          }
        },
        skip: offset,
        take: limit,
        orderBy: { updatedAt: 'desc' }
      });

      // Get total count
      const totalCount = await prisma.subscription.count({
        where: {
          payments: {
            some: {
              status: 'FAILED',
              createdAt: { gte: cutoffDate }
            }
          }
        }
      });

      // Get user details for each subscription and format results
      const formattedResults = await Promise.all(
        subscriptionsWithFailures.map(async (sub) => {
          let user = null;

          // Fetch user details based on userType
          switch (sub.userType) {
            case 'ADMIN':
              user = await prisma.admin.findUnique({
                where: { id: sub.userId },
                select: { id: true, email: true, firstName: true, lastName: true, status: true }
              });
              break;
            case 'TRAINER':
              user = await prisma.trainer.findUnique({
                where: { id: sub.userId },
                select: { id: true, email: true, firstName: true, lastName: true, status: true }
              });
              break;
            case 'CUSTOMER':
              user = await prisma.customer.findUnique({
                where: { id: sub.userId },
                select: { id: true, email: true, firstName: true, lastName: true }
              });
              break;
          }

          return {
            id: sub.id,
            status: sub.status,
            plan: {
              name: sub.plan.name,
              price: sub.plan.price,
              planType: sub.plan.planType
            },
            user: {
              id: user?.id,
              email: user?.email,
              firstName: user?.firstName,
              lastName: user?.lastName,
              role: sub.userType,
              status: user?.status || 'ACTIVE'
            },
            billing: {
              stripeCustomerId: sub.stripeCustomerId,
              stripeSubscriptionId: sub.stripeSubscriptionId
            },
            failedPayments: sub.payments.map(payment => ({
              id: payment.id,
              amount: payment.amount,
              createdAt: payment.createdAt,
              stripePaymentId: payment.stripePaymentId,
              failureReason: payment.failureReason || 'Unknown'
            })),
            totalFailedAmount: sub.payments.reduce((sum, p) => sum + p.amount, 0),
            lastFailureDate: sub.payments[0]?.createdAt,
            failureCount: sub.payments.length
          };
        })
      );

      return {
        subscriptions: formattedResults,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalSubscriptions: totalCount,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPreviousPage: page > 1
        },
        summary: {
          totalFailedSubscriptions: totalCount,
          totalFailedAmount: formattedResults.reduce((sum, sub) => sum + sub.totalFailedAmount, 0),
          averageFailuresPerSubscription: totalCount > 0
            ? formattedResults.reduce((sum, sub) => sum + sub.failureCount, 0) / totalCount
            : 0
        }
      };
    } catch (error) {
      log.error('Failed to get failed payment subscriptions', { error: error.message, filters });
      throw error;
    }
  },

  /**
   * Process refund for subscription payment
   */
  async processSubscriptionRefund(subscriptionId, refundData, processedBy) {
    try {
      const { paymentId, amount, reason, refundType = 'partial' } = refundData;

      // Get subscription and payment details
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: {
          plan: true,
          admin: { select: { email: true } },
          trainer: { select: { email: true } },
          customer: { select: { email: true } },
          payments: {
            where: paymentId ? { id: paymentId } : { status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (!subscription.payments.length) {
        throw new Error('No eligible payments found for refund');
      }

      const payment = subscription.payments[0];
      const user = subscription.admin || subscription.trainer || subscription.customer;

      if (!payment.stripePaymentId) {
        throw new Error('No Stripe payment ID found for refund');
      }

      // Calculate refund amount
      let refundAmount = amount;
      if (!refundAmount) {
        refundAmount = refundType === 'full' ? payment.amount : Math.floor(payment.amount / 2);
      }

      if (refundAmount > payment.amount) {
        throw new Error('Refund amount cannot exceed payment amount');
      }

      // Process refund through Stripe
      let stripeRefund;
      try {
        stripeRefund = await stripe.refunds.create({
          payment_intent: payment.stripePaymentId,
          amount: refundAmount,
          reason: reason || 'requested_by_customer',
          metadata: {
            processedBy,
            subscriptionId,
            paymentId: payment.id
          }
        });
      } catch (stripeError) {
        log.error('Stripe refund failed', {
          stripeError: stripeError.message,
          paymentId: payment.stripePaymentId
        });
        throw new Error(`Stripe refund failed: ${stripeError.message}`);
      }

      // Update payment record with refund information
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: refundAmount === payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          metadata: JSON.stringify({
            ...(payment.metadata && typeof payment.metadata === 'string'
              ? JSON.parse(payment.metadata)
              : {}),
            refund: {
              stripeRefundId: stripeRefund.id,
              refundAmount,
              processedBy,
              processedAt: new Date().toISOString(),
              reason
            }
          }),
          updatedAt: new Date()
        }
      });

      // Log the refund
      log.info('Subscription refund processed', {
        processedBy,
        subscriptionId,
        paymentId: payment.id,
        userEmail: user?.email,
        refundAmount,
        stripeRefundId: stripeRefund.id,
        reason
      });

      return {
        refund: {
          id: stripeRefund.id,
          amount: refundAmount,
          originalAmount: payment.amount,
          status: stripeRefund.status,
          reason: reason || 'requested_by_customer'
        },
        payment: updatedPayment,
        subscription,
        user
      };
    } catch (error) {
      log.error('Failed to process subscription refund', {
        error: error.message,
        subscriptionId,
        processedBy
      });
      throw error;
    }
  },

  // ==================== SYSTEM HEALTH & MONITORING ====================

  /**
   * Get comprehensive system health status
   */
  async getSystemHealth() {
    try {
      const startTime = Date.now();

      // Test database connectivity
      const dbHealth = await this._checkDatabaseHealth();

      // Test Stripe connectivity
      const stripeHealth = await this._checkStripeHealth();

      // Get system metrics
      const systemMetrics = this._getSystemMetrics();

      // Check service dependencies
      const dependencyHealth = await this._checkServiceDependencies();

      const responseTime = Date.now() - startTime;

      // Determine overall health status
      const allHealthy = [
        dbHealth.status,
        stripeHealth.status,
        dependencyHealth.status
      ].every(status => status === 'healthy');

      const overallStatus = allHealthy ? 'healthy' : 'degraded';

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        services: {
          database: dbHealth,
          stripe: stripeHealth,
          dependencies: dependencyHealth
        },
        system: systemMetrics,
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      };
    } catch (error) {
      log.error('Failed to get system health', { error: error.message });
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        services: {
          database: { status: 'unknown' },
          stripe: { status: 'unknown' },
          dependencies: { status: 'unknown' }
        }
      };
    }
  },

  /**
   * Get system performance metrics
   */
  async getSystemMetrics() {
    try {
      // Get database metrics
      const dbMetrics = await this._getDatabaseMetrics();

      // Get application metrics
      const appMetrics = this._getApplicationMetrics();

      // Get business metrics
      const businessMetrics = await this._getBusinessMetrics();

      return {
        database: dbMetrics,
        application: appMetrics,
        business: businessMetrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      log.error('Failed to get system metrics', { error: error.message });
      throw error;
    }
  },

  /**
   * Get system logs with filtering
   */
  async getSystemLogs(filters = {}) {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const {
        level = 'all',
        startDate,
        endDate,
        limit = 100,
        category = 'all'
      } = filters;

      const logsDir = path.resolve(process.cwd(), 'logs');
      const logFiles = await fs.readdir(logsDir);

      // Get relevant log files
      const relevantFiles = logFiles.filter(file => {
        if (category !== 'all') {
          return file.startsWith(category);
        }
        return file.endsWith('.log');
      });

      let allLogs = [];

      // Read and parse log files
      for (const file of relevantFiles) {
        const filePath = path.join(logsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        const parsedLogs = lines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: line
            };
          }
        });

        allLogs = allLogs.concat(parsedLogs);
      }

      // Apply filters
      let filteredLogs = allLogs;

      if (level !== 'all') {
        filteredLogs = filteredLogs.filter(log => log.level === level);
      }

      if (startDate) {
        filteredLogs = filteredLogs.filter(log =>
          new Date(log.timestamp) >= new Date(startDate)
        );
      }

      if (endDate) {
        filteredLogs = filteredLogs.filter(log =>
          new Date(log.timestamp) <= new Date(endDate)
        );
      }

      // Sort by timestamp (most recent first)
      filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Apply limit
      filteredLogs = filteredLogs.slice(0, limit);

      return {
        logs: filteredLogs,
        total: filteredLogs.length,
        filters: filters,
        availableCategories: ['combined', 'error', 'http'],
        availableLevels: ['error', 'warn', 'info', 'debug']
      };
    } catch (error) {
      log.error('Failed to get system logs', { error: error.message });
      throw error;
    }
  },

  /**
   * Get database health and statistics
   */
  async getDatabaseHealth() {
    try {
      const dbMetrics = await this._getDatabaseMetrics();
      const connectionInfo = await this._getDatabaseConnectionInfo();
      const tableStats = await this._getDatabaseTableStats();

      return {
        status: 'healthy',
        connection: connectionInfo,
        metrics: dbMetrics,
        tables: tableStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      log.error('Failed to get database health', { error: error.message });
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  },

  /**
   * Toggle maintenance mode
   */
  async toggleMaintenanceMode(enabled, reason = '', scheduledEnd = null) {
    try {
      // In a real application, you might store this in database or redis
      // For now, we'll use a simple file-based approach
      const fs = await import('fs/promises');
      const path = await import('path');

      const maintenanceFile = path.resolve(process.cwd(), '.maintenance');

      if (enabled) {
        const maintenanceInfo = {
          enabled: true,
          enabledAt: new Date().toISOString(),
          reason: reason || 'Scheduled maintenance',
          scheduledEnd: scheduledEnd || null,
          enabledBy: 'Super Admin'
        };

        await fs.writeFile(maintenanceFile, JSON.stringify(maintenanceInfo, null, 2));

        log.info('Maintenance mode enabled', maintenanceInfo);

        return {
          status: 'enabled',
          message: 'Maintenance mode has been enabled',
          details: maintenanceInfo
        };
      } else {
        try {
          await fs.unlink(maintenanceFile);
        } catch (error) {
          // File might not exist, which is fine
        }

        log.info('Maintenance mode disabled');

        return {
          status: 'disabled',
          message: 'Maintenance mode has been disabled',
          disabledAt: new Date().toISOString()
        };
      }
    } catch (error) {
      log.error('Failed to toggle maintenance mode', { error: error.message });
      throw error;
    }
  },

  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Check database health
   */
  async _checkDatabaseHealth() {
    try {
      const startTime = Date.now();

      // Simple database query to test connectivity
      await prisma.$queryRaw`SELECT 1 as test`;

      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        message: 'Database connection successful'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        message: 'Database connection failed'
      };
    }
  },

  /**
   * Check Stripe service health
   */
  async _checkStripeHealth() {
    try {
      const startTime = Date.now();

      // Test Stripe connectivity
      await stripe.accounts.retrieve();

      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        message: 'Stripe connection successful'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        message: 'Stripe connection failed'
      };
    }
  },

  /**
   * Check service dependencies
   */
  async _checkServiceDependencies() {
    try {
      // Add checks for external services here
      // For now, we'll just check if required environment variables are set
      const requiredEnvVars = [
        'DATABASE_URL',
        'JWT_SECRET',
        'STRIPE_SECRET_KEY'
      ];

      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

      if (missingVars.length > 0) {
        return {
          status: 'unhealthy',
          message: `Missing environment variables: ${missingVars.join(', ')}`
        };
      }

      return {
        status: 'healthy',
        message: 'All dependencies configured'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        message: 'Dependency check failed'
      };
    }
  },

  /**
   * Get system metrics
   */
  _getSystemMetrics() {
    const memUsage = process.memoryUsage();

    return {
      memory: {
        used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
      },
      cpu: {
        usage: process.cpuUsage()
      },
      nodejs: {
        version: process.version,
        uptime: process.uptime()
      }
    };
  },

  /**
   * Get database metrics
   */
  async _getDatabaseMetrics() {
    try {
      const [userCount, subscriptionCount, paymentCount] = await Promise.all([
        prisma.$queryRaw`SELECT 
          (SELECT COUNT(*) FROM super_admins) as superAdmins,
          (SELECT COUNT(*) FROM admins) as admins,
          (SELECT COUNT(*) FROM trainers) as trainers,
          (SELECT COUNT(*) FROM customers) as customers`,
        prisma.subscription.count(),
        prisma.payment.count()
      ]);

      // Convert BigInt values to regular numbers for JSON serialization
      const userCounts = userCount[0];
      const convertedUserCounts = {
        superAdmins: Number(userCounts.superAdmins),
        admins: Number(userCounts.admins),
        trainers: Number(userCounts.trainers),
        customers: Number(userCounts.customers)
      };

      return {
        tables: {
          users: convertedUserCounts,
          subscriptions: subscriptionCount,
          payments: paymentCount
        },
        connections: {
          active: 'Available via Prisma pool'
        }
      };
    } catch (error) {
      log.error('Failed to get database metrics', { error: error.message });
      return { error: error.message };
    }
  },

  /**
   * Get application metrics
   */
  _getApplicationMetrics() {
    return {
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch
    };
  },

  /**
   * Get business metrics
   */
  async _getBusinessMetrics() {
    try {
      const [activeSubscriptions, totalRevenue, todaySignups] = await Promise.all([
        prisma.subscription.count({ where: { status: 'ACTIVE' } }),
        prisma.payment.aggregate({
          where: { status: 'COMPLETED' },
          _sum: { amount: true }
        }),
        prisma.subscription.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        })
      ]);

      return {
        subscriptions: {
          active: activeSubscriptions,
          newToday: todaySignups
        },
        revenue: {
          total: Number(totalRevenue._sum.amount || 0) / 100
        }
      };
    } catch (error) {
      log.error('Failed to get business metrics', { error: error.message });
      return { error: error.message };
    }
  },

  /**
   * Get database connection info
   */
  async _getDatabaseConnectionInfo() {
    try {
      const result = await prisma.$queryRaw`SELECT CONNECTION_ID() as connectionId, DATABASE() as \`database\``;
      return {
        connectionId: Number(result[0]?.connectionId) || 'unknown',
        database: result[0]?.database || 'unknown',
        status: 'connected'
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  },

  /**
   * Get database table statistics
   */
  async _getDatabaseTableStats() {
    try {
      const tables = ['super_admins', 'admins', 'trainers', 'customers', 'subscriptions', 'payments'];
      const stats = {};

      for (const table of tables) {
        // Get table size information from information_schema
        const result = await prisma.$queryRaw`
          SELECT 
            TABLE_ROWS as rowCount,
            DATA_LENGTH as dataSize,
            INDEX_LENGTH as indexSize
          FROM information_schema.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = ${table}
        `;

        // Convert BigInt values to numbers for JSON serialization
        const tableData = result[0] || { rowCount: 0, dataSize: 0, indexSize: 0 };

        stats[table] = {
          rowCount: Number(tableData.rowCount || 0),
          dataSize: Number(tableData.dataSize || 0),
          indexSize: Number(tableData.indexSize || 0)
        };
      }

      return stats;
    } catch (error) {
      log.error('Failed to get table stats', { error: error.message });
      return { error: error.message };
    }
  },

  // ==================== PLATFORM CONFIGURATION MANAGEMENT ====================

  /**
   * Get comprehensive platform configuration
   */
  async getPlatformConfiguration() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Get configuration from multiple sources
      const [
        environmentConfig,
        databaseConfig,
        securityConfig,
        businessConfig,
        integrationConfig,
        featureFlags
      ] = await Promise.all([
        this._getEnvironmentConfig(),
        this._getDatabaseConfig(),
        this._getSecurityConfig(),
        this._getBusinessConfig(),
        this._getIntegrationConfig(),
        this._getFeatureFlags()
      ]);

      return {
        environment: environmentConfig,
        database: databaseConfig,
        security: securityConfig,
        business: businessConfig,
        integrations: integrationConfig,
        featureFlags: featureFlags,
        lastUpdated: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      };
    } catch (error) {
      log.error('Failed to get platform configuration', { error: error.message });
      throw error;
    }
  },

  /**
   * Update platform configuration settings
   */
  async updatePlatformConfiguration(updates, updatedBy) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const configFile = path.resolve(process.cwd(), 'platform-config.json');

      // Get current configuration
      let currentConfig = {};
      try {
        const configContent = await fs.readFile(configFile, 'utf-8');
        currentConfig = JSON.parse(configContent);
      } catch (error) {
        // File doesn't exist, create new config
        currentConfig = { created: new Date().toISOString() };
      }

      // Validate and apply updates
      const validatedUpdates = await this._validateConfigurationUpdates(updates);

      // Merge updates with current configuration
      const updatedConfig = {
        ...currentConfig,
        ...validatedUpdates,
        lastUpdated: new Date().toISOString(),
        updatedBy: updatedBy
      };

      // Save to file
      await fs.writeFile(configFile, JSON.stringify(updatedConfig, null, 2));

      // Log the configuration change
      log.info('Platform configuration updated', {
        updatedBy,
        updates: Object.keys(validatedUpdates),
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: 'Platform configuration updated successfully',
        updatedSettings: Object.keys(validatedUpdates),
        timestamp: updatedConfig.lastUpdated
      };
    } catch (error) {
      log.error('Failed to update platform configuration', {
        error: error.message,
        updatedBy
      });
      throw error;
    }
  },

  /**
   * Manage feature flags
   */
  async manageFeatureFlags(action, flagData, managedBy) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const flagsFile = path.resolve(process.cwd(), 'feature-flags.json');

      // Get current feature flags
      let currentFlags = {};
      try {
        const flagsContent = await fs.readFile(flagsFile, 'utf-8');
        currentFlags = JSON.parse(flagsContent);
      } catch (error) {
        currentFlags = { flags: {}, created: new Date().toISOString() };
      }

      const { flagName, enabled, rolloutPercentage, targetRoles, description } = flagData;

      switch (action) {
        case 'create':
        case 'update':
          if (!flagName) {
            throw new Error('Flag name is required');
          }

          currentFlags.flags[flagName] = {
            enabled: enabled !== undefined ? enabled : false,
            rolloutPercentage: rolloutPercentage || 0,
            targetRoles: targetRoles || [],
            description: description || '',
            createdAt: currentFlags.flags[flagName]?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: managedBy
          };
          break;

        case 'delete':
          if (!flagName || !currentFlags.flags[flagName]) {
            throw new Error('Flag not found');
          }
          delete currentFlags.flags[flagName];
          break;

        case 'toggle':
          if (!flagName || !currentFlags.flags[flagName]) {
            throw new Error('Flag not found');
          }
          currentFlags.flags[flagName].enabled = !currentFlags.flags[flagName].enabled;
          currentFlags.flags[flagName].updatedAt = new Date().toISOString();
          currentFlags.flags[flagName].updatedBy = managedBy;
          break;

        default:
          throw new Error('Invalid action. Use: create, update, delete, or toggle');
      }

      currentFlags.lastUpdated = new Date().toISOString();

      // Save feature flags
      await fs.writeFile(flagsFile, JSON.stringify(currentFlags, null, 2));

      log.info('Feature flag managed', {
        action,
        flagName,
        managedBy,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: `Feature flag '${flagName}' ${action}d successfully`,
        flag: action === 'delete' ? null : currentFlags.flags[flagName],
        allFlags: currentFlags.flags
      };
    } catch (error) {
      log.error('Failed to manage feature flag', {
        error: error.message,
        action,
        managedBy
      });
      throw error;
    }
  },

  /**
   * Get third-party integrations status
   */
  async getIntegrations() {
    try {
      const integrationConfig = await this._getIntegrationConfig();
      const healthChecks = await this._checkIntegrationsHealth();

      return {
        integrations: integrationConfig,
        health: healthChecks,
        summary: {
          total: Object.keys(integrationConfig).length,
          active: Object.values(integrationConfig).filter(i => i.enabled).length,
          healthy: Object.values(healthChecks).filter(h => h.status === 'healthy').length
        },
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      log.error('Failed to get integrations', { error: error.message });
      throw error;
    }
  },

  // ==================== PRIVATE CONFIGURATION HELPERS ====================

  /**
   * Get environment configuration
   */
  _getEnvironmentConfig() {
    return {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3000,
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime()
    };
  },

  /**
   * Get database configuration (safe info only)
   */
  async _getDatabaseConfig() {
    try {
      const connectionInfo = await this._getDatabaseConnectionInfo();
      return {
        provider: 'mysql',
        database: connectionInfo.database,
        connectionStatus: connectionInfo.status,
        pooling: 'enabled',
        ssl: process.env.DATABASE_URL?.includes('sslmode') ? 'enabled' : 'disabled'
      };
    } catch (error) {
      return {
        provider: 'mysql',
        connectionStatus: 'error',
        error: error.message
      };
    }
  },

  /**
   * Get security configuration (safe info only)
   */
  _getSecurityConfig() {
    return {
      jwtEnabled: !!process.env.JWT_SECRET,
      refreshTokenEnabled: !!process.env.JWT_REFRESH_SECRET,
      cors: {
        enabled: true,
        origin: process.env.CORS_ORIGIN || '*'
      },
      rateLimiting: {
        enabled: false // Add if implemented
      },
      encryption: {
        bcrypt: 'enabled',
        saltRounds: 12
      }
    };
  },

  /**
   * Get business configuration
   */
  async _getBusinessConfig() {
    try {
      const planCount = await prisma.subscriptionPlan.count();

      return {
        subscriptionPlans: {
          total: planCount,
          types: ['FREE', 'BASIC', 'STANDARD', 'PREMIUM', 'CUSTOMER']
        },
        defaultPlan: 'FREE',
        maxCustomersPerPlan: {
          FREE: 2,
          BASIC: 20,
          STANDARD: 40,
          PREMIUM: 60
        },
        businessRules: {
          allowSelfSignup: true,
          requireEmailVerification: false,
          autoActivateSubscriptions: true
        }
      };
    } catch (error) {
      log.error('Failed to get business config', { error: error.message });
      return { error: error.message };
    }
  },

  /**
   * Get integration configuration
   */
  _getIntegrationConfig() {
    return {
      stripe: {
        enabled: !!process.env.STRIPE_SECRET_KEY,
        mode: process.env.NODE_ENV === 'production' ? 'live' : 'test',
        webhooksEnabled: !!process.env.STRIPE_WEBHOOK_SECRET,
        features: ['payments', 'subscriptions', 'refunds']
      },
      email: {
        enabled: false, // Add when email service is implemented
        provider: 'none'
      },
      logging: {
        enabled: true,
        provider: 'winston',
        levels: ['error', 'warn', 'info', 'debug']
      },
      monitoring: {
        enabled: false // Add when monitoring service is implemented
      }
    };
  },

  /**
   * Get feature flags
   */
  async _getFeatureFlags() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const flagsFile = path.resolve(process.cwd(), 'feature-flags.json');

      try {
        const flagsContent = await fs.readFile(flagsFile, 'utf-8');
        const flagsData = JSON.parse(flagsContent);
        return flagsData.flags || {};
      } catch (error) {
        // No feature flags file exists, return defaults
        return {
          advancedAnalytics: {
            enabled: false,
            rolloutPercentage: 0,
            targetRoles: ['SUPER_ADMIN'],
            description: 'Advanced analytics dashboard'
          },
          betaFeatures: {
            enabled: false,
            rolloutPercentage: 0,
            targetRoles: ['SUPER_ADMIN'],
            description: 'Beta features access'
          }
        };
      }
    } catch (error) {
      log.error('Failed to get feature flags', { error: error.message });
      return {};
    }
  },

  /**
   * Validate configuration updates
   */
  async _validateConfigurationUpdates(updates) {
    const validatedUpdates = {};

    // Validate business configuration updates
    if (updates.business) {
      if (updates.business.defaultPlan) {
        const validPlans = ['FREE', 'BASIC', 'STANDARD', 'PREMIUM', 'CUSTOMER'];
        if (validPlans.includes(updates.business.defaultPlan)) {
          validatedUpdates.business = {
            ...validatedUpdates.business,
            defaultPlan: updates.business.defaultPlan
          };
        }
      }

      if (updates.business.businessRules) {
        validatedUpdates.business = {
          ...validatedUpdates.business,
          businessRules: {
            allowSelfSignup: typeof updates.business.businessRules.allowSelfSignup === 'boolean'
              ? updates.business.businessRules.allowSelfSignup
              : true,
            requireEmailVerification: typeof updates.business.businessRules.requireEmailVerification === 'boolean'
              ? updates.business.businessRules.requireEmailVerification
              : false,
            autoActivateSubscriptions: typeof updates.business.businessRules.autoActivateSubscriptions === 'boolean'
              ? updates.business.businessRules.autoActivateSubscriptions
              : true
          }
        };
      }
    }

    // Validate security configuration updates
    if (updates.security) {
      if (updates.security.cors && updates.security.cors.origin) {
        validatedUpdates.security = {
          ...validatedUpdates.security,
          cors: { origin: updates.security.cors.origin }
        };
      }
    }

    return validatedUpdates;
  },

  /**
   * Check integrations health
   */
  async _checkIntegrationsHealth() {
    const health = {};

    // Check Stripe health
    try {
      if (process.env.STRIPE_SECRET_KEY) {
        await stripe.accounts.retrieve();
        health.stripe = { status: 'healthy', lastChecked: new Date().toISOString() };
      } else {
        health.stripe = { status: 'not_configured' };
      }
    } catch (error) {
      health.stripe = {
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }

    // Check database health
    try {
      await prisma.$queryRaw`SELECT 1 as test`;
      health.database = { status: 'healthy', lastChecked: new Date().toISOString() };
    } catch (error) {
      health.database = {
        status: 'unhealthy',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }

    return health;
  }
};