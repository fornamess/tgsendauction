import { Router } from 'express';
import { BetController } from '../controllers/bet.controller';
import { authMiddleware } from '../utils/auth';
import { betLimiter } from '../middleware/rateLimitSimple';

const router = Router();

router.post('/', authMiddleware, betLimiter, BetController.placeBet);
router.get('/my', authMiddleware, BetController.getMyBet);

export { router as betRoutes };
