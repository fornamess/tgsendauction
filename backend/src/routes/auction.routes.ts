import { Router } from 'express';
import { AuctionController } from '../controllers/auction.controller';
import { adminLimiterRedis } from '../middleware/rateLimitRedis';
import { authMiddleware, adminMiddleware } from '../utils/auth';

const router = Router();

// Публичные эндпоинты
router.get('/current', authMiddleware, AuctionController.getCurrent);
router.get('/:auctionId', authMiddleware, AuctionController.getById);

// Админ эндпоинты - требуют права администратора + rate limit
router.get('/all', authMiddleware, adminMiddleware, adminLimiterRedis, AuctionController.getAll);
router.post('/', authMiddleware, adminMiddleware, adminLimiterRedis, AuctionController.create);
router.patch('/:auctionId', authMiddleware, adminMiddleware, adminLimiterRedis, AuctionController.update);
router.post('/:auctionId/start', authMiddleware, adminMiddleware, adminLimiterRedis, AuctionController.start);
router.post('/:auctionId/end', authMiddleware, adminMiddleware, adminLimiterRedis, AuctionController.end);

export { router as auctionRoutes };
