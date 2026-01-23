import { Request, Response } from 'express';
import crypto from 'crypto';
import { getRedisClient } from '../config/redis';
import { User } from '../models/User.model';
import { validateTelegramInitData } from '../utils/telegram';
import { logger } from '../utils/logger';

interface AuthTokenData {
  token: string;
  expiresAt: number;
  createdAt: number;
}

export class AuthController {
  /**
   * Генерация токена для авторизации через Telegram бота
   */
  static async generateToken(req: Request, res: Response) {
    try {
      // Генерируем случайный токен
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 минут
      const createdAt = Date.now();

      const tokenData: AuthTokenData = {
        token,
        expiresAt,
        createdAt,
      };

      // Сохраняем токен в Redis или в памяти (fallback)
      const redis = getRedisClient();
      if (redis) {
        await redis.setex(
          `auth_token:${token}`,
          600, // 10 минут в секундах
          JSON.stringify(tokenData)
        );
      } else {
        // Fallback: сохраняем в памяти (только для разработки)
        if (!global.authTokens) {
          global.authTokens = new Map();
        }
        global.authTokens.set(token, tokenData);
        // Автоматически удаляем через 10 минут
        setTimeout(() => {
          global.authTokens?.delete(token);
        }, 10 * 60 * 1000);
      }

      res.json({ token, expiresAt });
    } catch (error) {
      logger.error('Ошибка генерации токена', error);
      res.status(500).json({ error: 'Ошибка генерации токена' });
    }
  }

  /**
   * Верификация токена и связывание с пользователем Telegram
   * Вызывается ботом или когда пользователь возвращается с бота
   */
  static async verifyToken(req: Request, res: Response) {
    try {
      const { token } = req.body;
      const initData = req.headers['x-telegram-init-data'] as string;

      if (!token) {
        return res.status(400).json({ error: 'Токен не предоставлен' });
      }

      if (!initData || !process.env.TELEGRAM_BOT_TOKEN) {
        return res.status(400).json({ error: 'Данные Telegram не предоставлены' });
      }

      // Проверяем токен
      const redis = getRedisClient();
      let tokenData: AuthTokenData | null = null;

      if (redis) {
        const tokenDataStr = await redis.get(`auth_token:${token}`);
        if (tokenDataStr) {
          tokenData = JSON.parse(tokenDataStr);
          // Удаляем использованный токен
          await redis.del(`auth_token:${token}`);
        }
      } else {
        // Fallback: проверяем в памяти
        if (global.authTokens) {
          tokenData = global.authTokens.get(token) || null;
          global.authTokens.delete(token);
        }
      }

      if (!tokenData) {
        return res.status(400).json({ error: 'Неверный или истекший токен' });
      }

      if (Date.now() > tokenData.expiresAt) {
        return res.status(400).json({ error: 'Токен истек' });
      }

      // Проверяем данные Telegram
      const telegramUser = validateTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
      if (!telegramUser) {
        return res.status(401).json({ error: 'Неверные данные Telegram' });
      }

      // Найти или создать пользователя
      const userId = `tg_${telegramUser.id}`;
      let user = await User.findOne({ username: userId });
      
      if (!user) {
        user = new User({
          username: userId, // Используем tg_${id} как уникальный идентификатор
          balance: 0,
          robux: 0,
          telegramId: telegramUser.id,
          firstName: telegramUser.firstName,
          lastName: telegramUser.lastName,
          photoUrl: telegramUser.photoUrl,
        });
        await user.save();
      } else {
        // Обновляем данные Telegram
        if (telegramUser.firstName && user.firstName !== telegramUser.firstName) {
          user.firstName = telegramUser.firstName;
        }
        if (telegramUser.lastName && user.lastName !== telegramUser.lastName) {
          user.lastName = telegramUser.lastName;
        }
        // username в модели User - это уникальный идентификатор (tg_${id}), не обновляем его
        if (telegramUser.photoUrl && !user.photoUrl) {
          user.photoUrl = telegramUser.photoUrl;
        }
        if (!user.telegramId) {
          user.telegramId = telegramUser.id;
        }
        await user.save();
      }

      res.json({
        success: true,
        user: {
          id: user._id,
          username: user.username,
          telegramId: user.telegramId,
          firstName: user.firstName,
          lastName: user.lastName,
          photoUrl: user.photoUrl,
        },
      });
    } catch (error) {
      logger.error('Ошибка верификации токена', error);
      res.status(500).json({ error: 'Ошибка верификации токена' });
    }
  }
}

// Расширяем глобальный объект для хранения токенов в памяти (fallback)
declare global {
  var authTokens: Map<string, AuthTokenData> | undefined;
}
