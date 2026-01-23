import mongoose from 'mongoose';
import { Auction, AuctionStatus } from '../models/Auction.model';
import { Round, RoundStatus } from '../models/Round.model';
import { RankingService } from '../services/RankingService';
import { RoundService } from '../services/RoundService';
import { AuctionService } from '../services/AuctionService';
import { logger } from '../utils/logger';

/**
 * Обработать раунды: завершить истекшие, создать новые
 */
export async function processRoundsJob(): Promise<void> {
  const now = new Date();

  const activeRounds = await Round.find({
    status: RoundStatus.ACTIVE,
  }).exec();

  for (const round of activeRounds) {
    if (now >= round.endTime) {
      logger.info(`Завершение раунда ${round.number}`, { roundId: round._id.toString() });

      try {
        const auction = await Auction.findById(round.auctionId);
        if (!auction || auction.status !== AuctionStatus.ACTIVE) {
          continue;
        }

        await RoundService.endRound(round._id.toString());

        const totalRounds = auction.totalRounds ?? 30;
        const isLastRound = round.number >= totalRounds;
        let nextRoundId: string | null = null;

        if (!isLastRound) {
          const nextRound = await RoundService.createNextRound(auction, round.number);
          if (nextRound) {
            nextRoundId = nextRound._id.toString();
            logger.info(`Создан новый раунд`, {
              roundNumber: nextRound.number,
              roundId: nextRoundId,
              startTime: nextRound.startTime.toISOString(),
              endTime: nextRound.endTime.toISOString(),
            });
          }
        }

        logger.info(`Обработка победителей раунда ${round.number}`);
        const winners = await RankingService.processRoundWinners(round._id.toString(), {
          winnersPerRound: auction.winnersPerRound ?? 100,
          rewardAmount: auction.rewardAmount ?? 1000,
          nextRoundId,
        });
        logger.info(`Найдено победителей в раунде ${round.number}`, { count: winners.length });

        if (isLastRound) {
          logger.info(`Аукцион завершен по лимиту раундов`, { auctionId: auction._id.toString() });
          await AuctionService.endAuction(auction._id.toString());
          await processRefundsJob(auction._id.toString());
        }
      } catch (error: unknown) {
        logger.error(
          `Ошибка при завершении раунда ${round.number}`,
          error instanceof Error ? error : new Error(String(error)),
          {
            roundId: round._id.toString(),
          }
        );
      }
    }
  }

  const currentAuction = await AuctionService.getCurrentAuction();
  const currentRound = await RoundService.getCurrentRound();

  if (currentAuction && !currentRound && currentAuction.status === AuctionStatus.ACTIVE) {
    try {
      const newRound = await RoundService.createNextRound(currentAuction);
      if (newRound) {
        logger.info(`Создан новый раунд`, {
          roundNumber: newRound.number,
          roundId: newRound._id.toString(),
          startTime: newRound.startTime.toISOString(),
          endTime: newRound.endTime.toISOString(),
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (error && !errorMessage?.includes('активного аукциона')) {
        logger.error(
          'Ошибка при создании нового раунда',
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  }
}

const REFUND_BATCH_SIZE = 100; // Размер батча для возвратов
const BET_BATCH_SIZE = 1000; // Размер батча для чтения ставок

/**
 * Обработать возврат средств после окончания аукциона
 * Использует batch processing для больших объемов данных
 */
export async function processRefundsJob(auctionId: string): Promise<void> {
  logger.info(`Обработка возвратов для аукциона`, { auctionId });

  const auction = await Auction.findById(auctionId).exec();
  if (!auction) {
    logger.warn(`Аукцион не найден для обработки возвратов`, { auctionId });
    return;
  }

  if (auction.refundsProcessed) {
    logger.info(`Возвраты для аукциона уже были обработаны ранее`, { auctionId });
    return;
  }

  const { Bet } = await import('../models/Bet.model');
  const { Winner } = await import('../models/Winner.model');
  const { TransactionService } = await import('../services/TransactionService');
  const { TransactionType } = await import('../models/Transaction.model');
  const { Round } = await import('../models/Round.model');

  const rounds = await Round.find({ auctionId }).select('_id').lean().exec();
  const roundIds = rounds.map((r) => r._id);

  // Получаем победителей через aggregation
  const winners = await Winner.find({ roundId: { $in: roundIds } })
    .select('userId')
    .lean()
    .exec();
  const winnerUserIds = new Set(winners.map((w) => w.userId.toString()));

  // Используем aggregation для суммирования ставок по пользователям
  // Это более эффективно чем загрузка всех ставок в память
  const userBetsSummary = await Bet.aggregate([
    { $match: { roundId: { $in: roundIds } } },
    {
      $group: {
        _id: '$userId',
        totalAmount: { $sum: '$amount' },
      },
    },
  ]).exec();

  // Фильтруем не-победителей
  const usersToRefund = userBetsSummary
    .filter((u) => !winnerUserIds.has(u._id.toString()))
    .map((u) => ({ userId: u._id.toString(), totalAmount: u.totalAmount }));

  logger.info(`Найдено пользователей для возврата средств`, {
    auctionId,
    count: usersToRefund.length,
  });

  let successCount = 0;
  let errorCount = 0;

  // Обрабатываем возвраты батчами для контроля нагрузки
  for (let i = 0; i < usersToRefund.length; i += REFUND_BATCH_SIZE) {
    const batch = usersToRefund.slice(i, i + REFUND_BATCH_SIZE);
    
    // Параллельная обработка батча
    const results = await Promise.allSettled(
      batch.map(async ({ userId, totalAmount }) => {
        await TransactionService.createTransaction(
          new mongoose.Types.ObjectId(userId),
          TransactionType.REFUND,
          totalAmount,
          undefined,
          undefined,
          `Возврат средств после окончания аукциона`,
          `refund:${auctionId}:${userId}`
        );
        return { userId, totalAmount };
      })
    );

    // Подсчитываем результаты
    for (const result of results) {
      if (result.status === 'fulfilled') {
        successCount++;
        logger.debug(`Возвращено средств пользователю`, { 
          userId: result.value.userId, 
          amount: result.value.totalAmount 
        });
      } else {
        errorCount++;
        logger.error(
          `Ошибка возврата средств`,
          result.reason instanceof Error ? result.reason : new Error(String(result.reason))
        );
      }
    }

    // Небольшая пауза между батчами для снижения нагрузки
    if (i + REFUND_BATCH_SIZE < usersToRefund.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  logger.info(`Завершена обработка возвратов для аукциона`, {
    auctionId,
    successCount,
    errorCount,
    totalUsers: usersToRefund.length,
  });

  auction.refundsProcessed = true;
  await auction.save();
}

