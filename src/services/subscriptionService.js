import { PrismaClient } from '../generated/prisma/index.js';
import { stripeService } from './stripeService.js';
import { log } from '../utils/logger.js';

const prisma = new PrismaClient();

export const subscriptionService = {
  /**
   * Initialize subscription plans in database
   */
  async initializePlans() {
    const plans = [
      {
        name: 'Free Plan',
        planType: 'FREE',
        price: 0,
        maxCustomers: 2,
        stripeProductId: null,
        stripePriceId: null
      },
      {
        name: 'Basic Plan',
        planType: 'BASIC',
        price: 59.99,
        maxCustomers: 20,
        stripeProductId: null,
        stripePriceId: null
      },
      {
        name: 'Standard Plan',
        planType: 'STANDARD',
        price: 79.99,
        maxCustomers: 40,
        stripeProductId: null,
        stripePriceId: null
      },
      {
        name: 'Premium Plan',
        planType: 'PREMIUM',
        price: 99.99,
        maxCustomers: 60,
        stripeProductId: null,
        stripePriceId: null
      },
      {
        name: 'Customer Plan',
        planType: 'CUSTOMER',
        price: 24.99,
        maxCustomers: null,
        stripeProductId: null,
        stripePriceId: null
      }
    ];

    for (const plan of plans) {
      try {
        // Check if plan exists first
        const existingPlan = await prisma.subscriptionPlan.findFirst({
          where: { planType: plan.planType }
        });

        if (existingPlan) {
          // Update existing plan
          await prisma.subscriptionPlan.update({
            where: { id: existingPlan.id },
            data: plan
          });
        } else {
          // Create new plan
          await prisma.subscriptionPlan.create({
            data: plan
          });
        }

        log.business('Subscription plan initialized', {
          planType: plan.planType,
          price: plan.price
        });
      } catch (error) {
        log.error('Failed to initialize subscription plan', {
          planType: plan.planType,
          error: error.message
        });
      }
    }
  },

  /**
   * Get all available subscription plans
   */
  async getAvailablePlans(userType = null) {
    try {
      let whereClause = { isActive: true };
      
      // Filter plans based on user type
      if (userType === 'CUSTOMER') {
        whereClause.planType = 'CUSTOMER';
      } else if (userType === 'ADMIN' || userType === 'TRAINER') {
        whereClause.planType = { in: ['FREE', 'BASIC', 'STANDARD', 'PREMIUM'] };
      }

      const plans = await prisma.subscriptionPlan.findMany({
        where: whereClause,
        orderBy: { price: 'asc' }
      });

      return plans;
    } catch (error) {
      log.error('Failed to fetch subscription plans', {
        userType,
        error: error.message
      });
      throw error;
    }
  },

  /**
   * Create subscription for user
   */
  async createSubscription(userId, userType, planId, stripeCustomerId = null) {
    try {
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: planId }
      });

      if (!plan) {
        throw new Error('Subscription plan not found');
      }

      // For free plan, create active subscription immediately
      if (plan.planType === 'FREE') {
        const subscription = await prisma.subscription.create({
          data: {
            userId,
            userType,
            planId,
            status: 'ACTIVE',
            stripeCustomerId,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
          },
          include: { plan: true }
        });

        log.business('Free subscription created', {
          userId,
          userType,
          planType: plan.planType
        });

        return subscription;
      }

      // For paid plans, create inactive subscription (pending payment)
      const subscription = await prisma.subscription.create({
        data: {
          userId,
          userType,
          planId,
          status: 'INACTIVE',
          stripeCustomerId
        },
        include: { plan: true }
      });

      log.business('Paid subscription created (pending payment)', {
        userId,
        userType,
        planType: plan.planType,
        subscriptionId: subscription.id
      });

      return subscription;
    } catch (error) {
      log.error('Failed to create subscription', {
        userId,
        userType,
        planId,
        error: error.message
      });
      throw error;
    }
  },

  /**
   * Get user's current subscription
   */
  async getUserSubscription(userId, userType) {
    try {
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          userType
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' }
      });

      return subscription;
    } catch (error) {
      log.error('Failed to fetch user subscription', {
        userId,
        userType,
        error: error.message
      });
      throw error;
    }
  },

  /**
   * Check if trainer/admin can add more customers
   */
  async canAddCustomer(userId, userType) {
    try {
      const subscription = await this.getUserSubscription(userId, userType);
      
      if (!subscription || subscription.status !== 'ACTIVE') {
        return { 
          canAdd: false, 
          reason: 'No active subscription',
          currentCustomers: 0,
          maxCustomers: 0,
          remaining: 0
        };
      }

      // Customers don't have customer limits
      if (userType === 'CUSTOMER') {
        return { canAdd: true };
      }

      // Count current customers
      let currentCustomers = 0;
      if (userType === 'TRAINER') {
        currentCustomers = await prisma.customer.count({
          where: { trainerId: userId }
        });
      } else if (userType === 'ADMIN') {
        // Count customers under all trainers managed by this admin
        const trainers = await prisma.trainer.findMany({
          where: { adminId: userId },
          select: { id: true }
        });
        const trainerIds = trainers.map(t => t.id);
        currentCustomers = await prisma.customer.count({
          where: { trainerId: { in: trainerIds } }
        });
      }

      const maxCustomers = subscription.plan.maxCustomers || 0;
      const canAdd = currentCustomers < maxCustomers;
      
      return {
        canAdd,
        currentCustomers,
        maxCustomers,
        remaining: maxCustomers - currentCustomers
      };
    } catch (error) {
      log.error('Failed to check customer limit', {
        userId,
        userType,
        error: error.message
      });
      throw error;
    }
  },

  /**
   * Activate subscription after successful payment
   */
  async activateSubscription(stripeSubscriptionId) {
    try {
      const stripeSubscription = await stripeService.getSubscription(stripeSubscriptionId);
      
      // First try to find by stripeSubscriptionId
      let subscription = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId },
        include: { plan: true }
      });

      if (!subscription) {
        // If not found, look for INACTIVE subscription matching the metadata
        const metadata = stripeSubscription.metadata || {};
        if (metadata.userId && metadata.role) {
          subscription = await prisma.subscription.findFirst({
            where: {
              userId: metadata.userId,
              userType: metadata.role,
              status: 'INACTIVE'
            },
            include: { plan: true }
          });

          if (subscription) {
            // Update with Stripe subscription ID
            subscription = await prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                stripeSubscriptionId,
                status: 'ACTIVE',
                currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
                currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000)
              },
              include: { plan: true }
            });
          }
        }
      } else {
        // Update existing subscription
        subscription = await prisma.subscription.update({
          where: { stripeSubscriptionId },
          data: {
            status: 'ACTIVE',
            currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000)
          },
          include: { plan: true }
        });
      }

      if (subscription) {
        log.business('Subscription activated', {
          subscriptionId: subscription.id,
          stripeSubscriptionId,
          userId: subscription.userId
        });
      } else {
        log.error('Could not find subscription to activate', {
          stripeSubscriptionId,
          metadata: stripeSubscription.metadata
        });
      }

      return subscription;
    } catch (error) {
      log.error('Failed to activate subscription', {
        stripeSubscriptionId,
        error: error.message
      });
      throw error;
    }
  },

  /**
   * Create default free subscription for admin/trainer created by superadmin/admin
   */
  async createDefaultSubscription(userId, userType) {
    try {
      const freePlan = await prisma.subscriptionPlan.findFirst({
        where: { planType: 'FREE' }
      });

      if (!freePlan) {
        throw new Error('Free plan not found');
      }

      return await this.createSubscription(userId, userType, freePlan.id);
    } catch (error) {
      log.error('Failed to create default subscription', {
        userId,
        userType,
        error: error.message
      });
      throw error;
    }
  }
};