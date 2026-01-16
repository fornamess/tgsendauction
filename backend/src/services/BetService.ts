import mongoose from 'mongoose';
import { Bet, IBet } from '../models/Bet.model';
import { Round, RoundStatus } from '../models/Round.model';
import { TransactionType } from '../models/Transaction.model';
import { User } from '../models/User.model';
import {
  ConflictError,
  InsufficientFundsError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { RoundService } from './RoundService';
import { TransactionService } from './TransactionService';

export class BetService {
  /**
   * Разместить или повысить ставку
   * Работает без транзакций (для standalone MongoDB)
   */
  static async placeBet(
    userId: mongoose.Types.ObjectId,
    roundId: mongoose.Types.ObjectId,
    amount: number,
    session?: mongoose.ClientSession
  ): Promise<IBet> {
    // Не используем транзакции в standalone MongoDB
    // Полагаемся на уникальный индекс userId+roundId для предотвращения дубликатов

    // Проверить, что раунд активен
    let round = await Round.findById(roundId);
    if (!round) {
      throw new NotFoundError('Раунд', roundId.toString());
    }

    if (round.status !== RoundStatus.ACTIVE) {
      throw new ConflictError(`Раунд не активен. Статус: ${round.status}`);
    }

    const now = new Date();
    if (now < round.startTime || now > round.endTime) {
      throw new ConflictError('Раунд не активен в данный момент');
    }

    // Anti-sniping механизм: продление времени для первого раунда
    if (round.number === 1) {
      const timeUntilEnd = round.endTime.getTime() - now.getTime();
      const SNIPING_THRESHOLD = 10 * 1000; // 10 секунд
      const EXTENSION_TIME = 30 * 1000; // 30 секунд

      if (timeUntilEnd <= SNIPING_THRESHOLD && timeUntilEnd > 0) {
        await RoundService.extendRoundTime(roundId.toString(), EXTENSION_TIME);
        // Обновить round для дальнейшей проверки
        const updatedRound = await Round.findById(roundId);
        if (updatedRound) {
          round = updatedRound;
          logger.info(
            `⏰ Anti-sniping: раунд #${round.number} продлен на ${EXTENSION_TIME / 1000} секунд`,
            {
              roundId: roundId.toString(),
              timeUntilEnd: timeUntilEnd / 1000,
            }
          );
        }
      }
    }

    // Найти существующую ставку
    const existingBet = await Bet.findOne({ userId, roundId });

    let bet: IBet;

    if (existingBet) {
      // Повышение ставки - заменяем старую
      if (amount <= existingBet.amount) {
        throw new ValidationError(
          `Новая ставка должна быть больше текущей (текущая: ${existingBet.amount})`
        );
      }

      // Списываем только разницу
      const difference = amount - existingBet.amount;

      // Проверить баланс
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('Пользователь', userId.toString());
      }
      if (user.balance < difference) {
        throw new InsufficientFundsError(difference, user.balance);
      }

      // Обновить ставку
      existingBet.amount = amount;
      existingBet.version = (existingBet.version || 0) + 1;
      bet = await existingBet.save();

      // Создать транзакцию на разницу (без session - без транзакций)
      // Проверяем, что round все еще существует
      if (!round) {
        throw new NotFoundError('Раунд', roundId.toString());
      }
      await TransactionService.createTransaction(
        userId,
        TransactionType.BET,
        difference,
        roundId,
        bet._id,
        `Повышение ставки в раунде ${round.number}`
      );
    } else {
      // Новая ставка
      // Проверить баланс
      const user = await User.findById(userId);
      if (!user) {
        throw new NotFoundError('Пользователь', userId.toString());
      }
      if (user.balance < amount) {
        throw new InsufficientFundsError(amount, user.balance);
      }

      // Создать новую ставку
      bet = new Bet({
        userId,
        roundId,
        amount,
        version: 0,
      });
      bet = await bet.save();

      // Создать транзакцию (без session - без транзакций)
      // Проверяем, что round все еще существует
      if (!round) {
        throw new NotFoundError('Раунд', roundId.toString());
      }
      await TransactionService.createTransaction(
        userId,
        TransactionType.BET,
        amount,
        roundId,
        bet._id,
        `Ставка в раунде ${round.number}`
      );
    }

    return bet;
  }

  /**
   * Получить ставку пользователя в раунде
   */
  static async getUserBet(
    userId: mongoose.Types.ObjectId,
    roundId: mongoose.Types.ObjectId
  ): Promise<IBet | null> {
    return await Bet.findOne({ userId, roundId }).populate('userId').exec();
  }

  /**
   * Получить топ ставок раунда
   */
  static async getTopBets(roundId: mongoose.Types.ObjectId, limit: number = 100): Promise<IBet[]> {
    return await Bet.find({ roundId }).sort({ amount: -1 }).limit(limit).populate('userId').exec();
  }

  /**
   * Получить все ставки раунда
   */
  static async getRoundBets(roundId: mongoose.Types.ObjectId): Promise<IBet[]> {
    return await Bet.find({ roundId }).sort({ amount: -1 }).populate('userId').exec();
  }

  /**
   * Перенести ставку в следующий раунд (для проигравших)
   * Работает без транзакций (для standalone MongoDB)
   */
  static async transferBetToNextRound(
    userId: mongoose.Types.ObjectId,
    fromRoundId: mongoose.Types.ObjectId,
    toRoundId: mongoose.Types.ObjectId,
    session?: mongoose.ClientSession
  ): Promise<IBet> {
    // Не используем транзакции в standalone MongoDB

    // Найти ставку в старом раунде
    const oldBet = await Bet.findOne({ userId, roundId: fromRoundId });
    if (!oldBet) {
      throw new NotFoundError('Ставка');
    }

    // Проверить, нет ли уже ставки в новом раунде
    const existingBet = await Bet.findOne({ userId, roundId: toRoundId });
    if (existingBet) {
      // Объединить ставки (добавить сумму старой к новой)
      existingBet.amount += oldBet.amount;
      existingBet.version = (existingBet.version || 0) + 1;
      await existingBet.save();
      // Удалить старую ставку
      await Bet.deleteOne({ _id: oldBet._id });
      return existingBet;
    }

    // Создать новую ставку в новом раунде
    const newBet = new Bet({
      userId,
      roundId: toRoundId,
      amount: oldBet.amount,
      version: 0,
    });
    await newBet.save();

    // Удалить старую ставку
    await Bet.deleteOne({ _id: oldBet._id });

    return newBet;
  }

  /**
   * Получить ставки пользователя во всех раундах
   */
  static async getUserBets(
    userId: mongoose.Types.ObjectId,
    auctionId?: mongoose.Types.ObjectId
  ): Promise<IBet[]> {
    let query: any = { userId };

    if (auctionId) {
      // Найти все раунды аукциона
      const rounds = await Round.find({ auctionId }).select('_id').exec();
      const roundIds = rounds.map((r) => r._id);
      query.roundId = { $in: roundIds };
    }

    return await Bet.find(query).sort({ createdAt: -1 }).populate('roundId').exec();
  }
}
