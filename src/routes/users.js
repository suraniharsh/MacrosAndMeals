import express from 'express';
import { userController } from '../controllers/userController.js';

const router = express.Router();

// User CRUD routes - SUPER_ADMIN and ADMIN access
router.get('/', userController.getAllUsers);
router.post('/', userController.createUser);
router.get('/:id', userController.getUserById);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

export default router;