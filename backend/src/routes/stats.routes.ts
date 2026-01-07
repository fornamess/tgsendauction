import { Router } from 'express';
import { StatsController } from '../controllers/stats.controller';
import { authMiddleware } from '../utils/auth';

const router = Router();

router.get('/', authMiddleware, StatsController.getStats);

export { router as statsRoutes };
