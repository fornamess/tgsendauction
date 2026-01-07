import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.model';
import mongoose from 'mongoose';

/**
 * Простая система аутентификации через userId в заголовке или query
 * В реальном проекте здесь была бы JWT авторизация
 */
export interface AuthRequest extends Request {
  userId?: mongoose.Types.ObjectId;
  user?: any;
}

/**
 * Middleware для получения/создания пользователя
 */
export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    let userId: string | undefined;

    // Пробуем получить userId из разных источников
    if (req.headers['x-user-id']) {
      userId = req.headers['x-user-id'] as string;
    } else if (req.query.userId) {
      userId = req.query.userId as string;
    } else if (req.body.userId) {
      userId = req.body.userId as string;
    }

    // Если userId не передан, создаем анонимного пользователя или возвращаем ошибку
    if (!userId) {
      // Для некоторых эндпоинтов можно создать пользователя автоматически
      if (req.method === 'GET' && (req.path.includes('/api/auction') || req.path.includes('/api/round') || req.path.includes('/api/stats'))) {
        return next(); // Публичные эндпоинты
      }
      return res.status(401).json({ error: 'Необходима авторизация. Передайте userId в заголовке X-User-Id или query параметре' });
    }

    // Найти или создать пользователя
    let user = await User.findOne({ username: userId });
    if (!user) {
      // Создать нового пользователя
      user = new User({
        username: userId,
        balance: 0,
        robux: 0,
      });
      await user.save();
    }

    req.userId = user._id;
    req.user = user;
    next();
  } catch (error) {
    console.error('Ошибка в authMiddleware:', error);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
}
