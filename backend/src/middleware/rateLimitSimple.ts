/**
 * Простая реализация rate limiting без внешних зависимостей
 * Для production рекомендуется использовать redis-based rate limiting
 */

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const stores: {
  [key: string]: RateLimitStore;
} = {};

/**
 * Очистка устаревших записей
 */
function cleanupStore(storeName: string, windowMs: number) {
  const store = stores[storeName];
  if (!store) return;
  
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}

/**
 * Простой rate limiter
 */
export function createRateLimiter(
  windowMs: number,
  max: number,
  message: string = 'Слишком много запросов, попробуйте позже'
) {
  const storeName = `limiter_${windowMs}_${max}`;
  if (!stores[storeName]) {
    stores[storeName] = {};
  }

  return (req: any, res: any, next: any) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const store = stores[storeName];
    const now = Date.now();

    // Периодическая очистка (каждые 5 минут)
    if (Math.random() < 0.01) {
      cleanupStore(storeName, windowMs);
    }

    // Проверить текущую запись
    if (store[key] && store[key].resetTime > now) {
      // Запись существует и не истекла
      if (store[key].count >= max) {
        return res.status(429).json({ error: message });
      }
      store[key].count++;
    } else {
      // Создать новую запись
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
    }

    // Установить заголовки
    const remaining = Math.max(0, max - store[key].count);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', new Date(store[key].resetTime).toISOString());

    next();
  };
}

export const apiLimiter = createRateLimiter(15 * 60 * 1000, 100, 'Слишком много запросов, попробуйте позже');
export const betLimiter = createRateLimiter(60 * 1000, 10, 'Слишком много ставок, подождите немного');
export const depositLimiter = createRateLimiter(60 * 1000, 5, 'Слишком много пополнений, подождите немного');
