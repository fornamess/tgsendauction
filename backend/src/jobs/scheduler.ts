import cron from 'node-cron';
import { RoundService } from '../services/RoundService';
import { RankingService } from '../services/RankingService';
import { Round, RoundStatus } from '../models/Round.model';

/**
 * Запуск планировщика для автоматического управления раундами
 */
export function startScheduler() {
  console.log('⏰ Планировщик раундов запущен');

  // Каждую минуту проверяем, нужно ли завершить раунд или создать новый
  cron.schedule('* * * * *', async () => {
    try {
      await processRounds();
    } catch (error) {
      console.error('❌ Ошибка в планировщике раундов:', error);
    }
  });

  console.log('✅ Планировщик настроен: проверка каждую минуту');
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
      console.log(`🏁 Завершение раунда ${round.number} (${round._id})`);

      try {
        // Завершить раунд
        await RoundService.endRound(round._id.toString());

        // Обработать победителей
        console.log(`🎯 Обработка победителей раунда ${round.number}`);
        const winners = await RankingService.processRoundWinners(round._id.toString());
        console.log(`✅ Найдено ${winners.length} победителей в раунде ${round.number}`);
      } catch (error) {
        console.error(`❌ Ошибка при завершении раунда ${round.number}:`, error);
      }
    }
  }

  // Попытаться создать новый раунд, если нет активного
  const currentRound = await RoundService.getCurrentRound();
  if (!currentRound) {
    try {
      const newRound = await RoundService.createNextRound();
      if (newRound) {
        console.log(`✅ Создан новый раунд ${newRound.number} (${newRound._id})`);
        console.log(`   Старт: ${newRound.startTime.toISOString()}`);
        console.log(`   Окончание: ${newRound.endTime.toISOString()}`);
      }
      // Если newRound null, значит нет активного аукциона - это нормально, не логируем
    } catch (error: any) {
      // Логируем только реальные ошибки, не отсутствие аукциона
      if (error && !error.message?.includes('активного аукциона')) {
        console.error('❌ Ошибка при создании нового раунда:', error);
      }
    }
  }
}

/**
 * Обработать возврат средств после окончания аукциона
 */
export async function processRefunds(auctionId: string) {
  console.log(`💰 Обработка возвратов для аукциона ${auctionId}`);

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

  console.log(`📊 Найдено ${usersToRefund.length} пользователей для возврата средств`);

  // Вернуть средства
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
      console.log(`✅ Возвращено ${totalAmount} руб. пользователю ${userId}`);
    } catch (error) {
      console.error(`❌ Ошибка возврата средств пользователю ${userId}:`, error);
    }
  }

  console.log(`✅ Завершена обработка возвратов для аукциона ${auctionId}`);
}
