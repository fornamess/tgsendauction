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

/**
 * Обработать возврат средств после окончания аукциона
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

  const rounds = await Round.find({ auctionId }).select('_id').exec();
  const roundIds = rounds.map((r) => r._id);

  const winners = await Winner.find({ roundId: { $in: roundIds } })
    .select('userId')
    .exec();
  const winnerUserIds = new Set(winners.map((w) => w.userId.toString()));

  const allBets = await Bet.find({ roundId: { $in: roundIds } }).exec();

  const userBetsMap = new Map<string, number>();
  for (const bet of allBets) {
    const userIdStr = bet.userId.toString();
    const current = userBetsMap.get(userIdStr) || 0;
    userBetsMap.set(userIdStr, current + bet.amount);
  }

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

  let successCount = 0;
  let errorCount = 0;
  for (const { userId, totalAmount } of usersToRefund) {
    try {
      await TransactionService.createTransaction(
        new mongoose.Types.ObjectId(userId),
        TransactionType.REFUND,
        totalAmount,
        undefined,
        undefined,
        `Возврат средств после окончания аукциона`,
        `refund:${auctionId}:${userId}`
      );
      successCount++;
      logger.debug(`Возвращено средств пользователю`, { userId, amount: totalAmount });
    } catch (error: unknown) {
      errorCount++;
      logger.error(
        `Ошибка возврата средств пользователю ${userId}`,
        error instanceof Error ? error : new Error(String(error)),
        {
          userId,
          amount: totalAmount,
        }
      );
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

