import express from 'express';
import { billingController } from '../controllers/billingController.js';

const router = express.Router();

// Stripe billing routes
// TRAINER must pay via Stripe when signing up to manage more than 2 customers
router.post('/create-customer', billingController.createCustomer);
router.post('/create-checkout-session', billingController.createCheckoutSession);
router.get('/subscription', billingController.getSubscription);
router.post('/cancel', billingController.cancelSubscription);
router.post('/webhook', billingController.webhook);

export default router;