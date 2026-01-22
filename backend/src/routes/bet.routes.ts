import { Router } from 'express';
import { BetController } from '../controllers/bet.controller';
import { authMiddleware } from '../utils/auth';
import { betLimiterRedis } from '../middleware/rateLimitRedis';

const router = Router();

router.post('/', authMiddleware, betLimiterRedis, BetController.placeBet);
router.get('/my', authMiddleware, BetController.getMyBet);

export { router as betRoutes };
