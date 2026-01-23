import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { User, IUser } from '../models/User.model';
import { validateTelegramInitData } from './telegram';
import { logger } from './logger';
import { ForbiddenError } from './errors';

/**
 * Аутентификация через Telegram Mini App
 */
export interface AuthRequest extends Request {
  userId?: mongoose.Types.ObjectId;
  user?: IUser;
}

/**
 * Middleware для получения/создания пользователя
 * Поддерживает авторизацию через X-User-Id заголовок
 */
export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    let userId: string | undefined;

    // Проверяем заголовок X-User-Id
    const headerUserId = req.headers['x-user-id'] as string;
    if (headerUserId) {
      userId = headerUserId;
    }

    // Если авторизация не сработала
    if (!userId) {
      // Для публичных GET-эндпоинтов разрешаем доступ без авторизации
      const fullPath = req.baseUrl + req.path;
      const isPublicEndpoint = req.method === 'GET' && (
        req.path.includes('/api/auction') ||
        req.path.includes('/api/round') ||
        req.path.includes('/api/stats') ||
        fullPath.includes('/api/auction') ||
        fullPath.includes('/api/round') ||
        fullPath.includes('/api/stats') ||
        req.originalUrl.includes('/api/auction') ||
        req.originalUrl.includes('/api/round') ||
        req.originalUrl.includes('/api/stats')
      );
      if (isPublicEndpoint) {
        return next(); // Публичные эндпоинты
      }
      return res.status(401).json({ error: 'Необходима авторизация. Укажите X-User-Id заголовок' });
    }

    // Найти или создать пользователя
    let user = await User.findOne({ username: userId });
    if (!user) {
      // Создать нового пользователя
      const userData: Partial<IUser> = {
        username: userId,
        balance: 0,
        robux: 0,
      };

      user = new User(userData);
      await user.save();
    }

    req.userId = user._id;
    req.user = user;
    next();
  } catch (error) {
    logger.error('Ошибка в authMiddleware', error, {
      url: req.url,
      method: req.method,
    });
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
}

/**
 * Middleware для проверки админ-прав
 * Должен использоваться ПОСЛЕ authMiddleware
 */
export async function adminMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }

    if (!req.user.isAdmin) {
      logger.warn('Попытка доступа к админ-эндпоинту без прав', {
        userId: req.userId?.toString(),
        username: req.user.username,
        url: req.originalUrl,
        method: req.method,
      });
      return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора' });
    }

    next();
  } catch (error) {
    logger.error('Ошибка в adminMiddleware', error);
    res.status(500).json({ error: 'Ошибка проверки прав доступа' });
  }
}
