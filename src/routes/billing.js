import express from 'express';
import { billingController } from '../controllers/billingController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/plans', billingController.getPlans);

// Protected routes (authentication required)
router.get('/subscription', authenticate, billingController.getSubscription);
router.post('/create-checkout-session', authenticate, billingController.createCheckoutSession);
router.post('/cancel-subscription', authenticate, billingController.cancelSubscription);

// Webhook route (raw body required for Stripe signature verification)
router.post('/webhook', express.raw({ type: 'application/json' }), billingController.webhook);

export default router;