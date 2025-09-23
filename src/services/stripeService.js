import Stripe from 'stripe';
import { log } from '../utils/logger.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const stripeService = {
  /**
   * Create Stripe customer
   */
  async createCustomer(email, name, metadata = {}) {
    try {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata
      });

      log.billing('Stripe customer created', {
        customerId: customer.id,
        email,
        name
      });

      return customer;
    } catch (error) {
      log.error('Failed to create Stripe customer', {
        email,
        error: error.message
      });
      throw error;
    }
  },

  /**
   * Create checkout session for subscription
   */
  async createCheckoutSession(customerId, priceId, successUrl, cancelUrl, metadata = {}) {
    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        subscription_data: {
          metadata
        }
      });

      log.billing('Checkout session created', {
        sessionId: session.id,
        customerId,
        priceId
      });

      return session;
    } catch (error) {
      log.error('Failed to create checkout session', {
        customerId,
        priceId,
        error: error.message
      });
      throw error;
    }
  },

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      log.error('Failed to retrieve subscription', {
        subscriptionId,
        error: error.message
      });
      throw error;
    }
  },

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId, cancelAtPeriodEnd = true) {
    try {
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: cancelAtPeriodEnd
      });

      log.billing('Subscription cancellation requested', {
        subscriptionId,
        cancelAtPeriodEnd
      });

      return subscription;
    } catch (error) {
      log.error('Failed to cancel subscription', {
        subscriptionId,
        error: error.message
      });
      throw error;
    }
  },

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body, signature) {
    try {
      const event = stripe.webhooks.constructEvent(
        body, 
        signature, 
        process.env.STRIPE_WEBHOOK_SECRET
      );
      return event;
    } catch (error) {
      log.error('Webhook signature verification failed', {
        error: error.message
      });
      throw error;
    }
  }
};