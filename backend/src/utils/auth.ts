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
 * Поддерживает только Telegram Mini App авторизацию (через initData)
 */
export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    let userId: string | undefined;
    let telegramUser: ReturnType<typeof validateTelegramInitData> = null;

    // Проверяем Telegram Mini App initData
    const initData = req.headers['x-telegram-init-data'] as string;
    if (initData && process.env.TELEGRAM_BOT_TOKEN) {
      telegramUser = validateTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
      if (telegramUser) {
        userId = `tg_${telegramUser.id}`;
      }
    }

    // Если Telegram авторизация не сработала
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
      return res.status(401).json({ error: 'Необходима авторизация через Telegram Mini App' });
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

      // Если есть данные из Telegram, сохраняем их
      if (telegramUser) {
        userData.telegramId = telegramUser.id;
        userData.firstName = telegramUser.firstName;
        userData.lastName = telegramUser.lastName;
        userData.username = telegramUser.username || userId;
      }

      user = new User(userData);
      await user.save();
    } else if (telegramUser) {
      // Обновляем данные Telegram, если они изменились
      if (telegramUser.firstName && user.firstName !== telegramUser.firstName) {
        user.firstName = telegramUser.firstName;
      }
      if (telegramUser.lastName && user.lastName !== telegramUser.lastName) {
        user.lastName = telegramUser.lastName;
      }
      if (telegramUser.username && user.username !== telegramUser.username) {
        user.username = telegramUser.username;
      }
      if (telegramUser.photoUrl && !user.photoUrl) {
        user.photoUrl = telegramUser.photoUrl;
      }
      if (!user.telegramId) {
        user.telegramId = telegramUser.id;
      }
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
