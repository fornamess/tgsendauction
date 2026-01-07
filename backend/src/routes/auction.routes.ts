import { Router } from 'express';
import { AuctionController } from '../controllers/auction.controller';
import { authMiddleware } from '../utils/auth';

const router = Router();

// Публичные эндпоинты
router.get('/current', authMiddleware, AuctionController.getCurrent);
router.get('/all', authMiddleware, AuctionController.getAll); // Все аукционы (для админки)
router.get('/:auctionId', authMiddleware, AuctionController.getById);

// Админ эндпоинты (в реальном проекте здесь была бы проверка роли)
router.post('/', authMiddleware, AuctionController.create);
router.post('/:auctionId/start', authMiddleware, AuctionController.start);
router.post('/:auctionId/end', authMiddleware, AuctionController.end);

export { router as auctionRoutes };
