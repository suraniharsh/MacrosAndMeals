import express from 'express';
import { superAdminController } from '../controllers/superAdminController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All super admin routes require authentication and SUPER_ADMIN role
router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

// Dashboard & Analytics Routes
router.get('/dashboard', superAdminController.getDashboard);
router.get('/health', superAdminController.getSystemHealth);
router.get('/analytics', superAdminController.getAnalytics);
router.get('/revenue', superAdminController.getRevenue);

// User Management Routes
router.get('/users', superAdminController.getUsers);
router.get('/users/:id', superAdminController.getUserDetails);
router.put('/users/:id', superAdminController.updateUser);
router.delete('/users/:id', superAdminController.deleteUser);
router.post('/users/:id/suspend', superAdminController.suspendUser);
router.post('/users/:id/activate', superAdminController.activateUser);

// Advanced User Operations Routes
router.post('/users/:id/reset-password', superAdminController.resetUserPassword);
router.post('/users/:id/impersonate', superAdminController.impersonateUser);
router.get('/users/:id/activity', superAdminController.getUserActivity);
router.post('/bulk-operations', superAdminController.performBulkOperations);

// ==================== SUBSCRIPTION ADMINISTRATION ====================

// Get all subscriptions with filtering and analytics
router.get('/subscriptions', superAdminController.getAllSubscriptions);

// Modify subscription details
router.put('/subscriptions/:id', superAdminController.modifySubscription);

// Override subscription limits
router.post('/subscriptions/:id/override', superAdminController.overrideSubscriptionLimits);

// Get subscriptions with failed payments
router.get('/subscriptions/failed-payments', superAdminController.getFailedPaymentSubscriptions);

// Process subscription refund
router.post('/subscriptions/:id/refund', superAdminController.processSubscriptionRefund);

export default router;