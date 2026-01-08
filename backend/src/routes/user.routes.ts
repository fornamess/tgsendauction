import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { depositLimiter } from '../middleware/rateLimitSimple';
import { authMiddleware } from '../utils/auth';

const router = Router();

router.get('/me', authMiddleware, UserController.getMe);
router.post('/deposit', authMiddleware, depositLimiter, UserController.deposit);
router.get('/:userId', authMiddleware, UserController.getById);

export { router as userRoutes };
