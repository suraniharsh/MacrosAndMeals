import express from 'express';
import { mealPlanController } from '../controllers/mealPlanController.js';

const router = express.Router();

// Meal plan and diet routes
router.get('/', mealPlanController.getAllMealPlans);
router.post('/', mealPlanController.createMealPlan);
router.get('/:id', mealPlanController.getMealPlanById);
router.put('/:id', mealPlanController.updateMealPlan);
router.delete('/:id', mealPlanController.deleteMealPlan);

// Diet plan specific routes
router.get('/:id/meals', mealPlanController.getMealsForPlan);
router.post('/:id/meals', mealPlanController.addMealToPlan);

export default router;