import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authMiddleware } from '../utils/auth';

const router = Router();

router.get('/me', authMiddleware, UserController.getMe);
router.post('/deposit', authMiddleware, UserController.deposit);
router.get('/:userId', authMiddleware, UserController.getById);

export { router as userRoutes };
