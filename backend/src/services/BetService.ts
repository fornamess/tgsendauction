import mongoose from 'mongoose';
import { EXTENSION_TIME_MS, MAX_TOP_BETS_LIMIT, SNIPING_THRESHOLD_MS } from '../constants/auction';
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
   */
  static async placeBet(
    userId: mongoose.Types.ObjectId,
    roundId: mongoose.Types.ObjectId,
    amount: number,
    idempotencyKey?: string
  ): Promise<IBet> {
    // Проверка идемпотентности: если передан ключ, сначала проверяем существующие транзакции
    if (idempotencyKey) {
      const { Transaction } = await import('../models/Transaction.model');
      const { IdempotentRequest, IdempotentStatus } = await import('../models/IdempotentRequest.model');

      // Проверяем документ идемпотентности для новой ставки
      const newBetKey = `bet:new:${idempotencyKey}`;
      const idempotentDoc = await IdempotentRequest.findOne({
        key: newBetKey,
        type: 'Transaction',
      }).exec();

      if (idempotentDoc) {
        if (idempotentDoc.status === IdempotentStatus.SUCCEEDED && idempotentDoc.resultId) {
          // Найти транзакцию и получить betId
          const existingTx = await Transaction.findById(idempotentDoc.resultId).exec();
          if (existingTx && existingTx.betId) {
            const existingBet = await Bet.findById(existingTx.betId).exec();
            if (existingBet) {
              return existingBet;
            }
          }
        }

        if (idempotentDoc.status === IdempotentStatus.PENDING) {
          throw new ConflictError('Операция уже обрабатывается, повторите запрос позже.');
        }
      }
    }

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

      if (timeUntilEnd <= SNIPING_THRESHOLD_MS && timeUntilEnd > 0) {
        await RoundService.extendRoundTime(roundId.toString(), EXTENSION_TIME_MS);
        // Обновить round для дальнейшей проверки
        const updatedRound = await Round.findById(roundId);
        if (updatedRound) {
          round = updatedRound;
          logger.info(
            `⏰ Anti-sniping: раунд #${round.number} продлен на ${EXTENSION_TIME_MS / 1000} секунд`,
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
      // Если передан idempotencyKey и сумма та же, возвращаем существующую ставку (идемпотентность)
      // Это работает, так как если ставка уже создана с этой суммой, значит это повторный запрос
      if (idempotencyKey && existingBet.amount === amount) {
        return existingBet;
      }

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

      if (!round) {
        throw new NotFoundError('Раунд', roundId.toString());
      }
      await TransactionService.createTransaction(
        userId,
        TransactionType.BET,
        difference,
        roundId,
        bet._id,
        `Повышение ставки в раунде ${round.number}`,
        idempotencyKey ? `bet:increase:${idempotencyKey}` : undefined
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
      try {
        bet = new Bet({
          userId,
          roundId,
          amount,
          version: 0,
        });
        bet = await bet.save();
      } catch (saveError: any) {
        // Обработка race condition: если ставка уже создана другим запросом
        // Код 11000 - это MongoDB duplicate key error
        if (saveError.code === 11000) {
          // Найти существующую ставку
          const existingBet = await Bet.findOne({ userId, roundId });
          if (existingBet) {
            // Если сумма совпадает - это идемпотентный запрос, возвращаем существующую
            if (existingBet.amount === amount) {
              return existingBet;
            }
            // Если сумма отличается - это повышение ставки, обрабатываем как повышение
            if (amount > existingBet.amount) {
              const difference = amount - existingBet.amount;
              const user = await User.findById(userId);
              if (!user) {
                throw new NotFoundError('Пользователь', userId.toString());
              }
              if (user.balance < difference) {
                throw new InsufficientFundsError(difference, user.balance);
              }
              existingBet.amount = amount;
              existingBet.version = (existingBet.version || 0) + 1;
              bet = await existingBet.save();

              if (!round) {
                throw new NotFoundError('Раунд', roundId.toString());
              }
              await TransactionService.createTransaction(
                userId,
                TransactionType.BET,
                difference,
                roundId,
                bet._id,
                `Повышение ставки в раунде ${round.number}`,
                idempotencyKey ? `bet:increase:${idempotencyKey}` : undefined
              );
              return bet;
            } else {
              throw new ValidationError(
                `Новая ставка должна быть больше текущей (текущая: ${existingBet.amount})`
              );
            }
          }
        }
        // Если это не duplicate key ошибка - пробрасываем дальше
        throw saveError;
      }

      if (!round) {
        throw new NotFoundError('Раунд', roundId.toString());
      }
      await TransactionService.createTransaction(
        userId,
        TransactionType.BET,
        amount,
        roundId,
        bet._id,
        `Ставка в раунде ${round.number}`,
        idempotencyKey ? `bet:new:${idempotencyKey}` : undefined
      );
    }

    return bet;
  }

  /**
   * Получить ставку пользователя в раунде
   * Не используем populate для избежания N+1 запросов
   */
  static async getUserBet(
    userId: mongoose.Types.ObjectId,
    roundId: mongoose.Types.ObjectId
  ): Promise<IBet | null> {
    return await Bet.findOne({ userId, roundId }).lean<IBet>().exec();
  }

  /**
   * Получить топ ставок раунда с данными пользователей (через aggregation)
   * Использует $lookup вместо populate для избежания N+1 запросов
   */
  static async getTopBets(
    roundId: mongoose.Types.ObjectId,
    limit: number = MAX_TOP_BETS_LIMIT
  ): Promise<IBet[]> {
    // Используем aggregation с $lookup для одного запроса вместо N+1
    const bets = await Bet.aggregate([
      { $match: { roundId } },
      { $sort: { amount: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      {
        $addFields: {
          userId: { $arrayElemAt: ['$userInfo', 0] },
        },
      },
      { $project: { userInfo: 0 } },
    ]).exec();
    return bets;
  }

  /**
   * Получить ставки раунда с лимитом
   * По умолчанию лимит 1000, для избежания загрузки всех ставок в память
   */
  static async getRoundBets(
    roundId: mongoose.Types.ObjectId,
    limit: number = 1000
  ): Promise<IBet[]> {
    // Используем lean() и лимит для оптимизации
    return await Bet.find({ roundId })
      .sort({ amount: -1 })
      .limit(limit)
      .lean<IBet[]>()
      .exec();
  }

  /**
   * Перенести ставку в следующий раунд (для проигравших)
   */
  static async transferBetToNextRound(
    userId: mongoose.Types.ObjectId,
    fromRoundId: mongoose.Types.ObjectId,
    toRoundId: mongoose.Types.ObjectId
  ): Promise<IBet> {

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
    const savedBet = await newBet.save();

    // Удалить старую ставку
    await Bet.deleteOne({ _id: oldBet._id });

    // Вернуть сохраненную ставку, убедившись что она имеет все поля
    // Перезагружаем документ из БД, чтобы убедиться, что все поля присутствуют
    const refreshedBet = await Bet.findById(savedBet._id);
    if (!refreshedBet) {
      throw new Error('Не удалось найти сохраненную ставку');
    }
    return refreshedBet;
  }

  /**
   * Получить ставки пользователя во всех раундах
   * Добавлен лимит и lean() для оптимизации
   */
  static async getUserBets(
    userId: mongoose.Types.ObjectId,
    auctionId?: mongoose.Types.ObjectId,
    limit: number = 100
  ): Promise<IBet[]> {
    const query: { userId: mongoose.Types.ObjectId; roundId?: { $in: mongoose.Types.ObjectId[] } } = { userId };

    if (auctionId) {
      // Найти все раунды аукциона (только _id для минимизации данных)
      const rounds = await Round.find({ auctionId }).select('_id').lean().exec();
      const roundIds = rounds.map((r) => r._id);
      query.roundId = { $in: roundIds };
    }

    // Используем aggregation с $lookup для одного запроса вместо N+1
    const bets = await Bet.aggregate([
      { $match: query },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'rounds',
          localField: 'roundId',
          foreignField: '_id',
          as: 'roundInfo',
        },
      },
      {
        $addFields: {
          roundId: { $arrayElemAt: ['$roundInfo', 0] },
        },
      },
      { $project: { roundInfo: 0 } },
    ]).exec();

    return bets;
  }
}
