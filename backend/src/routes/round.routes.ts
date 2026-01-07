import { Router } from 'express';
import { RoundController } from '../controllers/round.controller';
import { authMiddleware } from '../utils/auth';

const router = Router();

router.get('/current', authMiddleware, RoundController.getCurrent);
router.get('/:roundId', authMiddleware, RoundController.getById);

export { router as roundRoutes };
