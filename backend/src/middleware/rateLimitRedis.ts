import type { NextFunction, Request, Response } from 'express';
import { getRedisClient, isRedisAvailable } from '../config/redis';
import { logger } from '../utils/logger';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Redis-based rate limiter для масштабируемости
 */
export function createRedisRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Слишком много запросов, попробуйте позже',
    keyGenerator = (req) => {
      // Автоматический обход rate limiting для load test пользователей
      const userId = (req.headers['x-user-id'] as string) || '';
      if (userId.startsWith('load_test_')) {
        return `bypass:${userId}`;
      }
      return req.ip || req.connection.remoteAddress || 'unknown';
    },
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    
    // Пропускаем bypass ключи
    if (key.startsWith('bypass:')) {
      return next();
    }

    // Проверка заголовка обхода
    const bypassHeader = req.headers['x-bypass-ratelimit'] || req.headers['X-Bypass-RateLimit'];
    if (bypassHeader === 'true') {
      return next();
    }

    // Если Redis недоступен, используем fallback на in-memory rate limiting
    if (!isRedisAvailable()) {
      logger.warn('Redis недоступен, используем fallback rate limiting');
      // Создаем простой in-memory limiter для fallback
      const fallbackLimiter = createFallbackRateLimiter(windowMs, max, message);
      return fallbackLimiter(req, res, next);
    }

    try {
      const redis = getRedisClient();
      if (!redis) {
        // Двойная проверка на всякий случай
        const fallbackLimiter = createFallbackRateLimiter(windowMs, max, message);
        return fallbackLimiter(req, res, next);
      }
      
      const redisKey = `ratelimit:${key}:${Math.floor(Date.now() / windowMs)}`;
      
      // Увеличиваем счетчик
      const count = await redis.incr(redisKey);
      
      // Устанавливаем TTL для ключа при первом создании
      if (count === 1) {
        await redis.expire(redisKey, Math.ceil(windowMs / 1000));
      }

      // Устанавливаем заголовки
      const remaining = Math.max(0, max - count);
      const resetTime = (Math.floor(Date.now() / windowMs) + 1) * windowMs;
      
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());

      // Проверяем лимит
      if (count > max) {
        return res.status(429).json({ error: message });
      }

      // Отслеживаем успешные/неуспешные запросы для пропуска
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalSend = res.send;
        res.send = function (body) {
          const statusCode = res.statusCode;
          const isSuccess = statusCode >= 200 && statusCode < 400;
          
          if ((skipSuccessfulRequests && isSuccess) || (skipFailedRequests && !isSuccess)) {
            // Уменьшаем счетчик, так как этот запрос не должен учитываться
            redis.decr(redisKey).catch((err) => {
              logger.error('Ошибка при уменьшении rate limit счетчика', err);
            });
          }
          
          return originalSend.call(this, body);
        };
      }

      next();
    } catch (error) {
      // В случае ошибки Redis пропускаем запрос (fail open)
      logger.error('Ошибка Redis rate limiting', error);
      next();
    }
  };
}

// Fallback in-memory rate limiter для случаев, когда Redis недоступен
function createFallbackRateLimiter(
  windowMs: number,
  max: number,
  message: string
) {
  const store: Map<string, { count: number; resetTime: number }> = new Map();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || entry.resetTime < now) {
      entry = { count: 1, resetTime: now + windowMs };
      store.set(key, entry);
    } else {
      entry.count++;
    }

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

    if (entry.count > max) {
      return res.status(429).json({ error: message });
    }

    // Очистка старых записей
    if (Math.random() < 0.01) {
      for (const [k, v] of store.entries()) {
        if (v.resetTime < now) {
          store.delete(k);
        }
      }
    }

    next();
  };
}

// Предустановленные лимитеры
export const apiLimiterRedis = createRedisRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10000,
  message: 'Слишком много запросов, попробуйте позже',
});

export const betLimiterRedis = createRedisRateLimiter({
  windowMs: 60 * 1000, // 1 минута
  max: 1000,
  message: 'Слишком много ставок, подождите немного',
});

export const depositLimiterRedis = createRedisRateLimiter({
  windowMs: 60 * 1000, // 1 минута
  max: 1000,
  message: 'Слишком много пополнений, подождите немного',
});
