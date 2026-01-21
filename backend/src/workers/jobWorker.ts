import { jobQueue, JobPayload } from '../infrastructure/queue';
import { logger } from '../utils/logger';
import { processRoundsJob, processRefundsJob } from '../application/roundJobs';
import { OutboxEvent, OutboxStatus } from '../models/OutboxEvent.model';
import { sendTelegramMessageSafe } from '../utils/telegram';

jobQueue.process(async (job) => {
  const payload = job.data as JobPayload;

  switch (payload.type) {
    case 'processRoundWinners': {
      await processRoundsJob();
      break;
    }
    case 'processRefunds': {
      await processRefundsJob(payload.auctionId);
      break;
    }
    case 'telegramNotification': {
      await handleTelegramNotification(payload);
      break;
    }
    default:
      logger.warn('Неизвестный тип джоба', { type: payload['type'] });
  }
});

async function handleTelegramNotification(payload: JobPayload): Promise<void> {
  if (payload.type !== 'telegramNotification') return;

  const event = await OutboxEvent.findOne({
    type: payload.event,
    status: OutboxStatus.PENDING,
  }).exec();

  if (!event) {
    return;
  }

  try {
    await sendTelegramMessageSafe(event.payload);
    event.status = OutboxStatus.PROCESSED;
    await event.save();
  } catch (error: unknown) {
    event.status = OutboxStatus.FAILED;
    event.errorMessage = error instanceof Error ? error.message : String(error);
    await event.save();
    logger.error('Ошибка отправки Telegram уведомления', error);
  }
}

