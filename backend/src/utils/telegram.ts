import * as crypto from 'crypto';
import { Request } from 'express';
import { logger } from './logger';

export interface TelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  isPremium: boolean;
  photoUrl?: string;
}

/**
 * Проверка подлинности initData от Telegram
 * @param initData - строка initData из window.Telegram.WebApp.initData
 * @param botToken - токен бота
 * @returns объект с данными пользователя или null если проверка не прошла
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string
): TelegramUser | null {
  try {
    // Парсим initData
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      return null;
    }

    // Удаляем hash из параметров для проверки
    params.delete('hash');

    // Сортируем параметры по ключу
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Создаем секретный ключ из токена бота
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Вычисляем хеш
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Сравниваем хеши
    if (calculatedHash !== hash) {
      return null;
    }

    // Проверяем время (auth_date не должен быть старше 24 часов)
    const authDate = parseInt(params.get('auth_date') || '0');
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - authDate > 86400) {
      return null;
    }

    // Парсим user данные
    const userStr = params.get('user');
    if (!userStr) {
      return null;
    }

    const user = JSON.parse(userStr) as {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
    };

    const result: TelegramUser = {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      languageCode: user.language_code,
      isPremium: user.is_premium ?? false,
      photoUrl: user.photo_url,
    };

    return result;
  } catch (error) {
    logger.error('Ошибка валидации initData', error);
    return null;
  }
}

/**
 * Проверка, является ли запрос из Telegram Mini App
 */
export function isTelegramRequest(req: Request): boolean {
  const userAgent = req.headers['user-agent'] || '';
  const referer = req.headers['referer'] || '';
  const origin = req.headers['origin'] || '';

  return (
    userAgent.includes('TelegramBot') ||
    referer.includes('telegram.org') ||
    referer.includes('t.me') ||
    origin.includes('telegram.org') ||
    origin.includes('t.me')
  );
}

/**
 * Безопасная отправка сообщения в Telegram через существующую интеграцию.
 * Пока что это заглушка, которую можно расширить под конкретную реализацию бота.
 */
export async function sendTelegramMessageSafe(payload: Record<string, unknown>): Promise<void> {
  // Здесь может быть интеграция с конкретным Telegram ботом.
  // Сейчас просто логируем событие, чтобы outbox-паттерн уже работал.
  logger.info('Telegram notification payload', payload);
}
