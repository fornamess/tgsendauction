import mongoose from 'mongoose';
import { Bet } from '../models/Bet.model';
import { Round } from '../models/Round.model';
import { Winner, IWinner } from '../models/Winner.model';
import { TransactionService } from './TransactionService';
import { TransactionType } from '../models/Transaction.model';
import { BetService } from './BetService';
import { RoundService } from './RoundService';
import { Auction } from '../models/Auction.model';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

export class RankingService {
  /**
   * Определить победителей раунда (топ-100) и начислить призы
   * Работает без транзакций (для standalone MongoDB)
   */
  static async processRoundWinners(roundId: string): Promise<IWinner[]> {
    // Не используем транзакции в standalone MongoDB
    // Операции выполняются последовательно

    const round = await Round.findById(roundId);
    if (!round) {
      throw new NotFoundError('Раунд', roundId);
    }

    // Получить аукцион для информации о призе
    const auction = await Auction.findById(round.auctionId);
    if (!auction) {
      throw new NotFoundError('Аукцион', round.auctionId.toString());
    }

    // Получить топ-100 ставок (уникальные пользователи по самой большой ставке)
    // Сначала группируем по пользователю, беря максимальную ставку
    const bets = await Bet.find({ roundId }).exec();

    // Группировка по userId, берем максимальную ставку для каждого пользователя
    const userBetsMap = new Map<string, typeof bets[0]>();
    for (const bet of bets) {
      const userIdStr = bet.userId.toString();
      const existing = userBetsMap.get(userIdStr);
      if (!existing || bet.amount > existing.amount) {
        userBetsMap.set(userIdStr, bet);
      }
    }

    // Сортируем по убыванию суммы и берем топ-100
    const topBets = Array.from(userBetsMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 100);

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
        prizeRobux: auction.prizeRobux,
      });
      await winner.save();

      // Начислить приз (робуксы) - без session, без транзакций
      await TransactionService.createTransaction(
        bet.userId,
        TransactionType.PRIZE,
        auction.prizeRobux,
        round._id,
        bet._id,
        `Приз за ${rank} место в раунде ${round.number}`
      );

      winners.push(winner);
    }

      // Перенести ставки проигравших в следующий раунд
      const losingBets = bets.filter(
        bet => !topBets.some(tb => tb.userId.toString() === bet.userId.toString())
      );

      // Найти следующий раунд
      const nextRound = await RoundService.getCurrentRound(round.auctionId.toString());

      if (nextRound && losingBets.length > 0) {
        // Группируем проигравшие ставки по пользователю
        const losingUsersMap = new Map<string, typeof bets[0]>();
        for (const bet of losingBets) {
          const userIdStr = bet.userId.toString();
          const existing = losingUsersMap.get(userIdStr);
          if (!existing || bet.amount > existing.amount) {
            losingUsersMap.set(userIdStr, bet);
          }
        }

        // Перенести каждую ставку (без session - без транзакций)
        let transferSuccess = 0;
        let transferErrors = 0;
        for (const bet of losingUsersMap.values()) {
          try {
            await BetService.transferBetToNextRound(
              bet.userId,
              bet.roundId,
              nextRound._id
            );
            transferSuccess++;
          } catch (error: any) {
            transferErrors++;
            logger.error(`Ошибка переноса ставки пользователя ${bet.userId}`, error, {
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
          total: losingUsersMap.size,
        });
      }

      return winners;
  }

  /**
   * Получить топ-100 текущего раунда
   */
  static async getCurrentTop100(roundId: string): Promise<any[]> {
    // Оптимизация: выбираем только нужные поля и сортируем на уровне БД
    const bets = await Bet.find({ roundId })
      .select('userId amount createdAt')
      .sort({ amount: -1 })
      .limit(200) // Берем больше для группировки
      .exec();

    // Группировка по userId, берем максимальную ставку
    const userBetsMap = new Map<string, typeof bets[0]>();
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
      .slice(0, 100);

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
  static async getUserRank(userId: mongoose.Types.ObjectId, roundId: string): Promise<number | null> {
    const userBet = await Bet.findOne({ userId, roundId })
      .select('amount')
      .exec();
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
    const uniqueUsersSameAmount = new Set(
      betsWithSameAmount.map(b => b.userId.toString())
    );

    // Ранг = количество ставок больше + уникальные пользователи с такой же суммой + 1
    return higherBetsCount + uniqueUsersSameAmount.size + 1;

    // Группировка и сортировка
    const userBetsMap = new Map<string, typeof bets[0]>();
    for (const bet of bets) {
      const userIdStr = bet.userId.toString();
      const existing = userBetsMap.get(userIdStr);
      if (!existing || bet.amount > existing.amount) {
        userBetsMap.set(userIdStr, bet);
      }
    }

    const sortedBets = Array.from(userBetsMap.values())
      .sort((a, b) => b.amount - a.amount);

    const rank = sortedBets.findIndex(
      bet => bet.userId.toString() === userId.toString()
    ) + 1;

    return rank > 0 ? rank : null;
  }
}
