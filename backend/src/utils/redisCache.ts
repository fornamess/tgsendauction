import { getRedisClient } from '../config/redis';
import { logger } from './logger';

type CacheKey = string;

export class RedisCache {
  private defaultTtlMs: number;
  private keyPrefix: string;

  constructor(defaultTtlMs: number = 5000, keyPrefix: string = 'cache:') {
    this.defaultTtlMs = defaultTtlMs;
    this.keyPrefix = keyPrefix;
  }

  private getKey(key: CacheKey): string {
    return `${this.keyPrefix}${key}`;
  }

  async get<T>(key: CacheKey): Promise<T | null> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        // Redis недоступен, возвращаем null (graceful degradation)
        return null;
      }
      const fullKey = this.getKey(key);
      const value = await redis.get(fullKey);
      
      if (!value) {
        return null;
      }

      try {
        return JSON.parse(value) as T;
      } catch (parseError) {
        logger.warn('Ошибка парсинга кеша', { key, error: parseError });
        // Удаляем поврежденный ключ
        await redis.del(fullKey);
        return null;
      }
    } catch (error) {
      logger.error('Ошибка получения из кеша', error, { key });
      // В случае ошибки возвращаем null, чтобы запрос пошел в БД
      return null;
    }
  }

  async set<T>(key: CacheKey, value: T, ttlMs?: number): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        // Redis недоступен, просто игнорируем (graceful degradation)
        return;
      }
      const fullKey = this.getKey(key);
      const ttl = typeof ttlMs === 'number' ? ttlMs : this.defaultTtlMs;
      const serialized = JSON.stringify(value);
      
      if (ttl > 0) {
        await redis.setex(fullKey, Math.ceil(ttl / 1000), serialized);
      } else {
        await redis.set(fullKey, serialized);
      }
    } catch (error) {
      logger.error('Ошибка записи в кеш', error, { key });
      // Не бросаем ошибку, чтобы не ломать основной функционал
    }
  }

  async delete(key: CacheKey): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return;
      }
      const fullKey = this.getKey(key);
      await redis.del(fullKey);
    } catch (error) {
      logger.error('Ошибка удаления из кеша', error, { key });
    }
  }

  async clear(pattern?: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return;
      }
      const searchPattern = pattern 
        ? this.getKey(pattern) 
        : `${this.keyPrefix}*`;
      
      const keys = await redis.keys(searchPattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.error('Ошибка очистки кеша', error, { pattern });
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    await this.clear(pattern);
  }

  async getOrSet<T>(
    key: CacheKey,
    fetcher: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    await this.set(key, value, ttlMs);
    return value;
  }
}

// Экспортируем готовые экземпляры для разных типов кеша
export const roundCache = new RedisCache(5000, 'cache:round:');
export const auctionCache = new RedisCache(5000, 'cache:auction:');
export const topBetsCache = new RedisCache(2000, 'cache:topbets:');
