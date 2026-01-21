import Queue from 'bull';
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

export const jobQueue = new Queue<JobPayload>('auction-jobs', redisUrl);

jobQueue.on('error', (err) => {
  logger.error('Ошибка в очереди задач', err);
});

