import { Router } from 'express';
import { BetController } from '../controllers/bet.controller';
import { authMiddleware } from '../utils/auth';

const router = Router();

router.post('/', authMiddleware, BetController.placeBet);
router.get('/my', authMiddleware, BetController.getMyBet);

export { router as betRoutes };
