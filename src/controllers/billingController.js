import { stripeService } from '../services/stripeService.js';
import { subscriptionService } from '../services/subscriptionService.js';
import { PrismaClient } from '../generated/prisma/index.js';

const prisma = new PrismaClient();

export const billingController = {
  /**
   * Get available subscription plans
   */
  getPlans: async (req, res) => {
    const logger = req.logger;
    
    try {
      const { userType } = req.query;
      const plans = await subscriptionService.getAvailablePlans(userType);

      logger.billing('Subscription plans retrieved', {
        count: plans.length,
        userType
      });

      return res.json({
        success: true,
        message: 'Subscription plans retrieved successfully',
        data: { plans }
      });
    } catch (error) {
      logger.error('Failed to retrieve subscription plans', {
        userType: req.query?.userType,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve subscription plans',
        error: 'PLANS_FETCH_ERROR'
      });
    }
  },

  /**
   * Get user's current subscription
   */
  getSubscription: async (req, res) => {
    const logger = req.logger;
    const { user } = req;
    
    try {
      const subscription = await subscriptionService.getUserSubscription(user.id, user.role);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'No subscription found',
          error: 'NO_SUBSCRIPTION'
        });
      }

      // Check customer limits for admins/trainers
      let customerLimits = null;
      if (user.role === 'ADMIN' || user.role === 'TRAINER') {
        customerLimits = await subscriptionService.canAddCustomer(user.id, user.role);
      }

      logger.billing('Subscription details retrieved', {
        userId: user.id,
        subscriptionId: subscription.id
      });

      return res.json({
        success: true,
        message: 'Subscription details retrieved successfully',
        data: {
          subscription: {
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
          },
          customerLimits
        }
      });
    } catch (error) {
      logger.error('Failed to retrieve subscription', {
        userId: user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve subscription details',
        error: 'SUBSCRIPTION_FETCH_ERROR'
      });
    }
  },

  /**
   * Create checkout session for plan upgrade/purchase
   */
  createCheckoutSession: async (req, res) => {
    const logger = req.logger;
    const { user } = req;
    const { planId } = req.body;
    
    try {
      if (!planId) {
        return res.status(400).json({
          success: false,
          message: 'Plan ID is required',
          error: 'MISSING_PLAN_ID'
        });
      }

      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: planId }
      });

      if (!plan || !plan.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or inactive subscription plan',
          error: 'INVALID_PLAN'
        });
      }

      if (plan.planType === 'FREE') {
        return res.status(400).json({
          success: false,
          message: 'Cannot create checkout session for free plan',
          error: 'FREE_PLAN_ERROR'
        });
      }

      // Get or create Stripe customer
      let stripeCustomerId;
      const currentSubscription = await subscriptionService.getUserSubscription(user.id, user.role);
      
      if (currentSubscription?.stripeCustomerId) {
        stripeCustomerId = currentSubscription.stripeCustomerId;
      } else {
        const stripeCustomer = await stripeService.createCustomer(
          user.email,
          `${user.firstName} ${user.lastName}`,
          { userId: user.id, role: user.role }
        );
        stripeCustomerId = stripeCustomer.id;
      }

      // Create checkout session
      const checkoutSession = await stripeService.createCheckoutSession(
        stripeCustomerId,
        plan.stripePriceId,
        `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        `${process.env.FRONTEND_URL}/payment-cancel`,
        {
          userId: user.id,
          planId: planId,
          role: user.role
        }
      );

      logger.billing('Checkout session created', {
        userId: user.id,
        planId,
        planType: plan.planType,
        checkoutSessionId: checkoutSession.id
      });

      return res.json({
        success: true,
        message: 'Checkout session created successfully',
        data: {
          checkoutUrl: checkoutSession.url,
          sessionId: checkoutSession.id,
          plan: {
            name: plan.name,
            price: plan.price,
            type: plan.planType
          }
        }
      });
    } catch (error) {
      logger.error('Failed to create checkout session', {
        userId: user.id,
        planId,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to create checkout session',
        error: 'CHECKOUT_SESSION_ERROR'
      });
    }
  },

  /**
   * Cancel subscription
   */
  cancelSubscription: async (req, res) => {
    const logger = req.logger;
    const { user } = req;
    
    try {
      const subscription = await subscriptionService.getUserSubscription(user.id, user.role);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'No active subscription found',
          error: 'NO_SUBSCRIPTION'
        });
      }

      if (subscription.plan.planType === 'FREE') {
        return res.status(400).json({
          success: false,
          message: 'Cannot cancel free plan',
          error: 'FREE_PLAN_CANCEL_ERROR'
        });
      }

      if (!subscription.stripeSubscriptionId) {
        return res.status(400).json({
          success: false,
          message: 'No Stripe subscription found',
          error: 'NO_STRIPE_SUBSCRIPTION'
        });
      }

      // Cancel in Stripe
      await stripeService.cancelSubscription(subscription.stripeSubscriptionId, true);

      // Update in database
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true }
      });

      logger.billing('Subscription cancellation requested', {
        userId: user.id,
        subscriptionId: subscription.id
      });

      return res.json({
        success: true,
        message: 'Subscription will be canceled at the end of the current period',
        data: {
          cancelAtPeriodEnd: true,
          currentPeriodEnd: subscription.currentPeriodEnd
        }
      });
    } catch (error) {
      logger.error('Failed to cancel subscription', {
        userId: user.id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to cancel subscription',
        error: 'CANCEL_SUBSCRIPTION_ERROR'
      });
    }
  },

  /**
   * Stripe webhook handler
   */
  webhook: async (req, res) => {
    const logger = req.logger || console;
    
    try {
      const sig = req.headers['stripe-signature'];
      let event;

      try {
        event = stripeService.verifyWebhookSignature(req.body, sig);
      } catch (err) {
        logger.error('Webhook signature verification failed', {
          error: err.message
        });
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      logger.billing('Webhook received', {
        eventType: event.type,
        eventId: event.id
      });

      // Handle the event
      switch (event.type) {
        case 'checkout.session.completed':
          await billingController.handleCheckoutCompleted(event.data.object);
          break;

        case 'invoice.payment_succeeded':
          await billingController.handlePaymentSucceeded(event.data.object);
          break;

        case 'invoice.payment_failed':
          await billingController.handlePaymentFailed(event.data.object);
          break;

        case 'customer.subscription.updated':
          await billingController.handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await billingController.handleSubscriptionDeleted(event.data.object);
          break;

        default:
          logger.billing('Unhandled webhook event type', {
            eventType: event.type
          });
      }

      res.json({ received: true });
    } catch (error) {
      logger.error('Webhook processing failed', {
        error: error.message
      });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  },

  // Webhook event handlers
  handleCheckoutCompleted: async (session) => {
    try {
      console.log('Processing checkout completion:', session.id);
      
      if (session.subscription) {
        // Activate the subscription
        const subscription = await subscriptionService.activateSubscription(session.subscription);
        console.log('Subscription activated:', session.subscription);

        // Create initial payment record if subscription was found and activated
        if (subscription && session.amount_total) {
          const existingPayment = await prisma.payment.findFirst({
            where: {
              subscriptionId: subscription.id,
              amount: session.amount_total / 100 // Convert from cents
            }
          });

          if (!existingPayment) {
            await prisma.payment.create({
              data: {
                subscriptionId: subscription.id,
                stripePaymentId: `checkout_${session.id}`,
                amount: session.amount_total / 100, // Convert from cents
                currency: session.currency || 'usd',
                status: 'COMPLETED',
                paymentMethod: 'stripe',
                paidAt: new Date()
              }
            });
            console.log('Initial payment record created for checkout:', session.id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle checkout completion:', error);
    }
  },

  handlePaymentSucceeded: async (invoice) => {
    try {
      console.log('Payment succeeded:', invoice.id);
      
      // Record payment in database
      if (invoice.subscription) {
        let subscription = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId: invoice.subscription }
        });

        // If not found by stripeSubscriptionId, try to find by metadata
        if (!subscription && invoice.lines?.data?.[0]?.metadata) {
          const metadata = invoice.lines.data[0].metadata;
          if (metadata.userId && metadata.role) {
            subscription = await prisma.subscription.findFirst({
              where: {
                userId: metadata.userId,
                userType: metadata.role,
                status: { in: ['ACTIVE', 'INACTIVE'] }
              }
            });

            // Update subscription with Stripe ID if found
            if (subscription && !subscription.stripeSubscriptionId) {
              subscription = await prisma.subscription.update({
                where: { id: subscription.id },
                data: { stripeSubscriptionId: invoice.subscription }
              });
            }
          }
        }

        if (subscription) {
          // Check if payment already exists to avoid duplicates
          const existingPayment = await prisma.payment.findFirst({
            where: {
              subscriptionId: subscription.id,
              stripePaymentId: invoice.payment_intent
            }
          });

          if (!existingPayment) {
            await prisma.payment.create({
              data: {
                subscriptionId: subscription.id,
                stripePaymentId: invoice.payment_intent,
                amount: invoice.amount_paid / 100, // Convert from cents
                currency: invoice.currency,
                status: 'COMPLETED',
                paymentMethod: 'stripe',
                paidAt: new Date(invoice.status_transitions.paid_at * 1000)
              }
            });
            
            console.log('Payment record created for subscription:', subscription.id);
          } else {
            console.log('Payment record already exists for:', invoice.payment_intent);
          }
        } else {
          console.log('No subscription found for invoice:', invoice.id);
        }
      }
    } catch (error) {
      console.error('Failed to handle payment success:', error);
    }
  },

  handlePaymentFailed: async (invoice) => {
    try {
      console.log('Payment failed:', invoice.id);
      
      // Update subscription status if needed
      if (invoice.subscription) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: invoice.subscription },
          data: { status: 'PAST_DUE' }
        });
      }
    } catch (error) {
      console.error('Failed to handle payment failure:', error);
    }
  },

  handleSubscriptionUpdated: async (subscription) => {
    try {
      console.log('Subscription updated:', subscription.id);
      
      // Update subscription in database
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          status: subscription.status.toUpperCase(),
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end
        }
      });
    } catch (error) {
      console.error('Failed to handle subscription update:', error);
    }
  },

  handleSubscriptionDeleted: async (subscription) => {
    try {
      console.log('Subscription deleted:', subscription.id);
      
      // Mark subscription as canceled
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: { status: 'CANCELED' }
      });
    } catch (error) {
      console.error('Failed to handle subscription deletion:', error);
    }
  }
};