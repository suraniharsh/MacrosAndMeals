import express from 'express';
import { customerController } from '../controllers/customerController.js';

const router = express.Router();

// Customer self-service routes
router.get('/profile', customerController.getProfile);
router.put('/profile', customerController.updateProfile);
router.get('/mealplans', customerController.getMealPlans);
router.get('/progress', customerController.getProgress);

export default router;