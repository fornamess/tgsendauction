import Queue, { JobOptions } from 'bull';
import { logger } from '../utils/logger';

export type JobType = 'processRoundWinners' | 'processRefunds' | 'telegramNotification';

export interface BaseJobPayload {
  type: JobType;
}

export interface ProcessRoundWinnersPayload extends BaseJobPayload {
  type: 'processRoundWinners';
  roundId: string;
}

export interface ProcessRefundsPayload extends BaseJobPayload {
  type: 'processRefunds';
  auctionId: string;
}

export interface TelegramNotificationPayload extends BaseJobPayload {
  type: 'telegramNotification';
  event: 'round_winners' | 'auction_ended';
  data: Record<string, unknown>;
}

export type JobPayload =
  | ProcessRoundWinnersPayload
  | ProcessRefundsPayload
  | TelegramNotificationPayload;

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

/**
 * Bull Queue с настроенным concurrency, retries и timeout
 */
export const jobQueue = new Queue<JobPayload>('auction-jobs', redisUrl, {
  defaultJobOptions: {
    attempts: 3, // 3 попытки
    backoff: {
      type: 'exponential',
      delay: 1000, // Начальная задержка 1 секунда
    },
    timeout: 60000, // Таймаут 60 секунд
    removeOnComplete: 100, // Хранить только последние 100 завершенных джобов
    removeOnFail: 50, // Хранить только последние 50 упавших джобов
  },
  settings: {
    lockDuration: 30000, // Лок на 30 секунд
    lockRenewTime: 15000, // Обновление лока каждые 15 секунд
    stalledInterval: 30000, // Проверка зависших джобов каждые 30 секунд
    maxStalledCount: 2, // Максимум 2 раза джоб может быть помечен как зависший
  },
});

// Обработчик событий очереди
jobQueue.on('error', (err) => {
  logger.error('Ошибка в очереди задач', err);
});

jobQueue.on('failed', (job, err) => {
  logger.error(`Задача ${job.id} упала после ${job.attemptsMade} попыток`, err, {
    jobType: job.data.type,
    attemptsMade: job.attemptsMade,
  });
});

jobQueue.on('stalled', (job) => {
  logger.warn(`Задача ${job.id} зависла`, {
    jobType: job.data.type,
  });
});

jobQueue.on('completed', (job) => {
  logger.debug(`Задача ${job.id} завершена`, {
    jobType: job.data.type,
    duration: job.finishedOn ? job.finishedOn - (job.processedOn || 0) : 0,
  });
});

/**
 * Добавить задачу в очередь с опциональными параметрами
 */
export async function addJob(
  payload: JobPayload,
  options?: JobOptions
): Promise<Queue.Job<JobPayload>> {
  return await jobQueue.add(payload, options);
}

