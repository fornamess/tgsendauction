import { Router } from 'express';
import { RoundController } from '../controllers/round.controller';
import { authMiddleware } from '../utils/auth';

const router = Router();

router.get('/current', authMiddleware, RoundController.getCurrent);
router.post('/current/end', authMiddleware, RoundController.endCurrent);
router.post('/next', authMiddleware, RoundController.createNext);
router.get('/:roundId', authMiddleware, RoundController.getById);

export { router as roundRoutes };
