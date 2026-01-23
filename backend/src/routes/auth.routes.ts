import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();

// Генерация токена для авторизации (публичный эндпоинт)
router.post('/generate-token', AuthController.generateToken);

// Верификация токена (требует Telegram initData)
router.post('/verify-token', AuthController.verifyToken);

export { router as authRoutes };
