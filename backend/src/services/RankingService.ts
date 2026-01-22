import mongoose from 'mongoose';
import { DEFAULT_REWARD_AMOUNT, DEFAULT_WINNERS_PER_ROUND, MAX_TOP_BETS_LIMIT } from '../constants/auction';
import { Auction } from '../models/Auction.model';
import { Bet } from '../models/Bet.model';
import { Round } from '../models/Round.model';
import { TransactionType } from '../models/Transaction.model';
import { IWinner, Winner } from '../models/Winner.model';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { BetService } from './BetService';
import { RoundService } from './RoundService';
import { TransactionService } from './TransactionService';

export class RankingService {
  /**
   * Определить победителей раунда (топ-100) и начислить призы
   */
  static async processRoundWinners(
    roundId: string,
    options?: {
      winnersPerRound?: number;
      rewardAmount?: number;
      nextRoundId?: string | null;
    }
  ): Promise<IWinner[]> {

    const round = await Round.findById(roundId);
    if (!round) {
      throw new NotFoundError('Раунд', roundId);
    }

    // Получить аукцион для информации о призе и настройках
    const auction = await Auction.findById(round.auctionId);
    if (!auction) {
      throw new NotFoundError('Аукцион', round.auctionId.toString());
    }
    const winnersPerRound =
      options?.winnersPerRound ?? auction.winnersPerRound ?? DEFAULT_WINNERS_PER_ROUND;
    const rewardAmount =
      options?.rewardAmount ?? auction.rewardAmount ?? DEFAULT_REWARD_AMOUNT;

    // Получить топ-100 ставок (уникальные пользователи по самой большой ставке)
    // Сначала группируем по пользователю, беря максимальную ставку
    const bets = await Bet.find({ roundId }).exec();

    // Группировка по userId, берем максимальную ставку для каждого пользователя
    const userBetsMap = new Map<string, (typeof bets)[0]>();
    for (const bet of bets) {
      const userIdStr = bet.userId.toString();
      const existing = userBetsMap.get(userIdStr);
      if (!existing || bet.amount > existing.amount) {
        userBetsMap.set(userIdStr, bet);
      }
    }

    // Сортируем по убыванию суммы и берем топ-N
    const topBets = Array.from(userBetsMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, winnersPerRound);

    // Определить проигравших пользователей (тех, кто не в топе)
    const topUserIds = new Set(topBets.map((tb) => tb.userId.toString()));

    // Создать записи победителей и начислить призы
    const winners: IWinner[] = [];
    for (let i = 0; i < topBets.length; i++) {
      const bet = topBets[i];
      const rank = i + 1;

      // Создать запись победителя
      const winner = new Winner({
        userId: bet.userId,
        roundId: round._id,
        betId: bet._id,
        rank,
        prizeRobux: rewardAmount, // Сохраняем для истории, но можно переименовать в rewardAmount в будущем
      });
      await winner.save();

      // Начислить приз (робуксы)
      await TransactionService.createTransaction(
        bet.userId,
        TransactionType.PRIZE,
        rewardAmount,
        round._id,
        bet._id,
        `Приз за ${rank} место в раунде ${round.number}`,
        `prize:${round._id.toString()}:${bet.userId.toString()}:${rank}`
      );

      winners.push(winner);
    }

    // Найти следующий раунд
    const nextRound = options?.nextRoundId
      ? await Round.findById(options.nextRoundId)
      : await RoundService.getCurrentRound(round.auctionId.toString());

    if (nextRound) {
      // Фильтруем проигравших из уже сгруппированных ставок (тех, кто не в топе)
      const losingBets = Array.from(userBetsMap.values()).filter(
        (bet) => !topUserIds.has(bet.userId.toString())
      );

      // Перенести каждую ставку
      let transferSuccess = 0;
      let transferErrors = 0;
      for (const bet of losingBets) {
        try {
          // Убеждаемся, что roundId является ObjectId
          const fromRoundId = typeof bet.roundId === 'string'
            ? new mongoose.Types.ObjectId(bet.roundId)
            : bet.roundId;
          await BetService.transferBetToNextRound(bet.userId, fromRoundId, nextRound._id);
          transferSuccess++;
        } catch (error: unknown) {
          transferErrors++;
          logger.error(`Ошибка переноса ставки пользователя ${bet.userId}`, error instanceof Error ? error : new Error(String(error)), {
            userId: bet.userId.toString(),
            fromRoundId: bet.roundId.toString(),
            toRoundId: nextRound._id.toString(),
          });
          // Продолжаем для остальных ставок
        }
      }
      logger.info(`Перенос ставок завершен`, {
        roundId,
        success: transferSuccess,
        errors: transferErrors,
        total: losingBets.length,
      });
    }

    return winners;
  }

  /**
   * Получить топ-100 текущего раунда
   */
  static async getCurrentTop100(
    roundId: string,
    limit: number = MAX_TOP_BETS_LIMIT
  ): Promise<Array<{ rank: number; bet: ReturnType<typeof Bet.prototype.toObject> }>> {
    // Оптимизация: выбираем только нужные поля и сортируем на уровне БД
    const bets = await Bet.find({ roundId })
      .select('userId amount createdAt')
      .sort({ amount: -1 })
      .limit(Math.max(limit * 2, 200)) // Берем больше для группировки
      .exec();

    // Группировка по userId, берем максимальную ставку
    const userBetsMap = new Map<string, (typeof bets)[0]>();
    for (const bet of bets) {
      const userIdStr = bet.userId.toString();
      const existing = userBetsMap.get(userIdStr);
      if (!existing || bet.amount > existing.amount) {
        userBetsMap.set(userIdStr, bet);
      }
    }

    // Сортировка и топ-100
    const topBets = Array.from(userBetsMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);

    // Пополнить данными пользователя
    const result = await Promise.all(
      topBets.map(async (bet, index) => {
        await bet.populate('userId');
        return {
          rank: index + 1,
          bet: bet.toObject(),
        };
      })
    );

    return result;
  }

  /**
   * Получить позицию пользователя в раунде
   */
  static async getUserRank(
    userId: mongoose.Types.ObjectId,
    roundId: string
  ): Promise<number | null> {
    const userBet = await Bet.findOne({ userId, roundId }).select('amount').exec();
    if (!userBet) {
      return null;
    }

    // Оптимизация: считаем только ставки больше или равные текущей
    const higherBetsCount = await Bet.countDocuments({
      roundId,
      amount: { $gt: userBet.amount },
    }).exec();

    // Группировка для одинаковых сумм (берем максимум по пользователю)
    const betsWithSameAmount = await Bet.find({
      roundId,
      amount: userBet.amount,
      userId: { $ne: userId },
    })
      .select('userId amount')
      .exec();

    // Уникальные пользователи с такой же суммой
    const uniqueUsersSameAmount = new Set(betsWithSameAmount.map((b) => b.userId.toString()));

    // Ранг = количество ставок больше + уникальные пользователи с такой же суммой + 1
    return higherBetsCount + uniqueUsersSameAmount.size + 1;
  }
}
