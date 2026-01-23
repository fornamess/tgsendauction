import cron from 'node-cron';
import { processRoundsJob } from '../application/roundJobs';
import { getRedisClient, isRedisAvailable } from '../config/redis';
import { logger } from '../utils/logger';

const LOCK_KEY = 'scheduler:round-processor:lock';
const LOCK_TTL_SECONDS = 55; // Чуть меньше минуты, чтобы успеть завершить

/**
 * Попытка получить distributed lock через Redis
 */
async function acquireLock(): Promise<boolean> {
  if (!isRedisAvailable()) {
    // Если Redis недоступен, разрешаем выполнение (single instance fallback)
    logger.warn('Redis недоступен, distributed lock отключен');
    return true;
  }

  const redis = getRedisClient();
  if (!redis) return true;

  try {
    // SET NX EX - атомарная операция: установить если не существует + TTL
    const result = await redis.set(LOCK_KEY, process.pid.toString(), 'EX', LOCK_TTL_SECONDS, 'NX');
    return result === 'OK';
  } catch (error) {
    logger.error('Ошибка при получении distributed lock', error);
    return false;
  }
}

/**
 * Освободить distributed lock
 */
async function releaseLock(): Promise<void> {
  if (!isRedisAvailable()) return;

  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.del(LOCK_KEY);
  } catch (error) {
    logger.error('Ошибка при освобождении distributed lock', error);
  }
}

/**
 * Запуск планировщика для автоматического управления раундами
 * Использует distributed lock для предотвращения concurrent execution
 */
export function startScheduler() {
  logger.info('Планировщик раундов запущен');

  // Каждую минуту проверяем, нужно ли завершить раунд или создать новый
  cron.schedule('* * * * *', async () => {
    // Пробуем получить distributed lock
    const hasLock = await acquireLock();
    if (!hasLock) {
      logger.debug('Пропуск выполнения: другой инстанс уже обрабатывает раунды');
      return;
    }

    try {
      await processRoundsJob();
    } catch (error: unknown) {
      logger.error('Ошибка в планировщике раундов', error instanceof Error ? error : new Error(String(error)));
    } finally {
      // Освобождаем lock после завершения
      await releaseLock();
    }
  });

  logger.info('Планировщик настроен: проверка каждую минуту с distributed lock');
}
