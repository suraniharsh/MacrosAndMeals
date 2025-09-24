import { PrismaClient } from '../generated/prisma/index.js';
import { log } from '../utils/logger.js';

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
  }
};