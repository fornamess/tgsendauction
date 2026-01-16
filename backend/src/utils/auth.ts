import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.model';
import mongoose from 'mongoose';
import { validateTelegramInitData, isTelegramRequest } from './telegram';

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
 * Поддерживает Telegram Mini App (через initData) и обычную авторизацию (через X-User-Id)
 */
export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    let userId: string | undefined;
    let telegramUser: any = null;

    // Проверяем Telegram Mini App initData
    const initData = req.headers['x-telegram-init-data'] as string;
    if (initData && process.env.TELEGRAM_BOT_TOKEN) {
      telegramUser = validateTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
      if (telegramUser) {
        userId = `tg_${telegramUser.id}`;
      }
    }

    // Если Telegram авторизация не сработала, пробуем обычную
    if (!userId) {
      if (req.headers['x-user-id']) {
        userId = req.headers['x-user-id'] as string;
      } else if (req.query.userId) {
        userId = req.query.userId as string;
      } else if (req.body.userId) {
        userId = req.body.userId as string;
      }
    }

    // Если userId не передан, создаем анонимного пользователя или возвращаем ошибку
    if (!userId) {
      // Для некоторых эндпоинтов можно создать пользователя автоматически
      // Проверяем как полный путь, так и относительный (для mounted routers)
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
      return res.status(401).json({ error: 'Необходима авторизация. Передайте userId в заголовке X-User-Id или query параметре' });
    }

    // Найти или создать пользователя
    let user = await User.findOne({ username: userId });
    if (!user) {
      // Создать нового пользователя
      const userData: any = {
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
    console.error('Ошибка в authMiddleware:', error);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
}
