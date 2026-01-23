import { Router } from 'express';
import { RoundController } from '../controllers/round.controller';
import { adminLimiterRedis } from '../middleware/rateLimitRedis';
import { authMiddleware, adminMiddleware } from '../utils/auth';

const router = Router();

// Публичные эндпоинты
router.get('/current', authMiddleware, RoundController.getCurrent);
router.get('/:roundId', authMiddleware, RoundController.getById);

// Админ эндпоинты - требуют права администратора + rate limit
router.post('/current/end', authMiddleware, adminMiddleware, adminLimiterRedis, RoundController.endCurrent);
router.post('/next', authMiddleware, adminMiddleware, adminLimiterRedis, RoundController.createNext);

export { router as roundRoutes };
