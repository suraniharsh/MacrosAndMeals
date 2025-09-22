import express from 'express';
import { trainerController } from '../controllers/trainerController.js';

const router = express.Router();

// Trainer CRUD routes
router.get('/', trainerController.getAllTrainers);
router.post('/', trainerController.createTrainer);
router.get('/:id', trainerController.getTrainerById);
router.put('/:id', trainerController.updateTrainer);
router.delete('/:id', trainerController.deleteTrainer);

// Trainer-customer management routes
router.get('/:id/customers', trainerController.getTrainerCustomers);
router.post('/:id/customers', trainerController.createCustomerForTrainer);
router.put('/:id/customers/:customerId', trainerController.updateTrainerCustomer);
router.delete('/:id/customers/:customerId', trainerController.removeCustomerFromTrainer);

export default router;