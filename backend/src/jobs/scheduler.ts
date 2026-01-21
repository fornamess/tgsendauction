import cron from 'node-cron';
import { processRoundsJob } from '../application/roundJobs';
import { logger } from '../utils/logger';

/**
 * Запуск планировщика для автоматического управления раундами
 */
export function startScheduler() {
  logger.info('Планировщик раундов запущен');

  // Каждую минуту проверяем, нужно ли завершить раунд или создать новый
  cron.schedule('* * * * *', async () => {
    try {
      await processRoundsJob();
    } catch (error: unknown) {
      logger.error('Ошибка в планировщике раундов', error instanceof Error ? error : new Error(String(error)));
    }
  });

  logger.info('Планировщик настроен: проверка каждую минуту');
}
