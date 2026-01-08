import cron from 'node-cron';
import { RoundService } from '../services/RoundService';
import { RankingService } from '../services/RankingService';
import { Round, RoundStatus } from '../models/Round.model';
import { AuctionService } from '../services/AuctionService';
import { logger } from '../utils/logger';

/**
 * Запуск планировщика для автоматического управления раундами
 */
export function startScheduler() {
  logger.info('Планировщик раундов запущен');

  // Каждую минуту проверяем, нужно ли завершить раунд или создать новый
  cron.schedule('* * * * *', async () => {
    try {
      await processRounds();
    } catch (error: any) {
      logger.error('Ошибка в планировщике раундов', error);
    }
  });

  logger.info('Планировщик настроен: проверка каждую минуту');
}

/**
 * Обработать раунды: завершить истекшие, создать новые
 */
async function processRounds() {
  const now = new Date();

  // Найти все активные раунды
  const activeRounds = await Round.find({
    status: RoundStatus.ACTIVE,
  }).exec();

  for (const round of activeRounds) {
    // Если время раунда истекло, завершить его
    if (now >= round.endTime) {
      logger.info(`Завершение раунда ${round.number}`, { roundId: round._id.toString() });

      try {
        // Завершить раунд
        await RoundService.endRound(round._id.toString());

        // Обработать победителей
        logger.info(`Обработка победителей раунда ${round.number}`);
        const winners = await RankingService.processRoundWinners(round._id.toString());
        logger.info(`Найдено победителей в раунде ${round.number}`, { count: winners.length });
      } catch (error: any) {
        logger.error(`Ошибка при завершении раунда ${round.number}`, error, { roundId: round._id.toString() });
      }
    }
  }

  // Попытаться создать новый раунд, если нет активного
  const currentAuction = await AuctionService.getCurrentAuction();
  const currentRound = await RoundService.getCurrentRound();

  if (currentAuction && !currentRound) {
    try {
      const newRound = await RoundService.createNextRound();
      if (newRound) {
        logger.info(`Создан новый раунд`, {
          roundNumber: newRound.number,
          roundId: newRound._id.toString(),
          startTime: newRound.startTime.toISOString(),
          endTime: newRound.endTime.toISOString(),
        });
      }
    } catch (error: any) {
      // Логируем только реальные ошибки, не отсутствие аукциона
      if (error && !error.message?.includes('активного аукциона')) {
        logger.error('Ошибка при создании нового раунда', error);
      }
    }
  }
}

/**
 * Обработать возврат средств после окончания аукциона
 */
export async function processRefunds(auctionId: string) {
  logger.info(`Обработка возвратов для аукциона`, { auctionId });

  // Найти всех пользователей, которые делали ставки, но не выиграли ни в одном раунде
  // Это делается через Winner модель - находим всех, кто не является победителем

  const { Bet } = await import('../models/Bet.model');
  const { Winner } = await import('../models/Winner.model');
  const { TransactionService } = await import('../services/TransactionService');
  const { TransactionType } = await import('../models/Transaction.model');
  const { Round } = await import('../models/Round.model');

  // Найти все раунды аукциона
  const rounds = await Round.find({ auctionId }).select('_id').exec();
  const roundIds = rounds.map(r => r._id);

  // Найти всех победителей
  const winners = await Winner.find({ roundId: { $in: roundIds } }).select('userId').exec();
  const winnerUserIds = new Set(winners.map(w => w.userId.toString()));

  // Найти все ставки
  const allBets = await Bet.find({ roundId: { $in: roundIds } }).exec();

  // Группируем по пользователю, суммируем все ставки
  const userBetsMap = new Map<string, number>();
  for (const bet of allBets) {
    const userIdStr = bet.userId.toString();
    const current = userBetsMap.get(userIdStr) || 0;
    userBetsMap.set(userIdStr, current + bet.amount);
  }

  // Найти пользователей без побед
  const usersToRefund: Array<{ userId: string; totalAmount: number }> = [];
  for (const [userId, totalAmount] of userBetsMap.entries()) {
    if (!winnerUserIds.has(userId)) {
      usersToRefund.push({ userId, totalAmount });
    }
  }

  logger.info(`Найдено пользователей для возврата средств`, {
    auctionId,
    count: usersToRefund.length,
  });

  // Вернуть средства
  let successCount = 0;
  let errorCount = 0;
  for (const { userId, totalAmount } of usersToRefund) {
    try {
      await TransactionService.createTransaction(
        userId as any,
        TransactionType.REFUND,
        totalAmount,
        undefined,
        undefined,
        `Возврат средств после окончания аукциона`
      );
      successCount++;
      logger.debug(`Возвращено средств пользователю`, { userId, amount: totalAmount });
    } catch (error: any) {
      errorCount++;
      logger.error(`Ошибка возврата средств пользователю ${userId}`, error, {
        userId,
        amount: totalAmount,
      });
    }
  }

  logger.info(`Завершена обработка возвратов для аукциона`, {
    auctionId,
    successCount,
    errorCount,
    totalUsers: usersToRefund.length,
  });
}
