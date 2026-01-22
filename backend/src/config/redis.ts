import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;

export const connectRedis = async (): Promise<Redis | null> => {
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      enableReadyCheck: true,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis подключен');
    });

    redisClient.on('ready', () => {
      logger.info('✅ Redis готов к работе');
    });

    redisClient.on('error', (error) => {
      logger.error('❌ Ошибка Redis', error);
    });

    redisClient.on('close', () => {
      logger.warn('⚠️ Redis соединение закрыто');
    });

    redisClient.on('reconnecting', () => {
      logger.info('🔄 Переподключение к Redis...');
    });

    // Ждем готовности с таймаутом
    try {
      await Promise.race([
        redisClient.ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
        )
      ]);
      logger.info('✅ Redis подключен и готов', { url: redisUrl.replace(/\/\/.*@/, '//***@') });
      return redisClient;
    } catch (pingError) {
      const errorObj = pingError instanceof Error ? pingError : new Error(String(pingError));
      logger.error('⚠️ Redis ping не прошел, продолжаем без Redis', errorObj);
      // Не бросаем ошибку, продолжаем без Redis (graceful degradation)
      return null;
    }
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logger.error('⚠️ Ошибка подключения к Redis, продолжаем без Redis', errorObj);
    // Не бросаем ошибку, продолжаем без Redis (graceful degradation)
    return null;
  }
};

export const getRedisClient = (): Redis | null => {
  if (!redisClient || redisClient.status !== 'ready') {
    // Возвращаем null вместо ошибки для graceful degradation
    return null;
  }
  return redisClient;
};

export const isRedisAvailable = (): boolean => {
  return redisClient !== null && redisClient.status === 'ready';
};

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis отключен');
  }
};
