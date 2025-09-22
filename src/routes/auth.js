import express from 'express';
import { authController } from '../controllers/authController.js';
import { authenticate, optionalAuth, authorize } from '../middleware/auth.js';

const router = express.Router();

// Public authentication routes
router.post('/register', optionalAuth, authController.register);
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);

// Protected authentication routes
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);

// Admin management routes (Super Admin only)
router.post('/create-admin', authenticate, authorize('SUPER_ADMIN'), authController.createAdmin);

// Trainer management routes (Admin only)
router.post('/create-trainer', authenticate, authorize('ADMIN'), authController.createTrainer);

export default router;