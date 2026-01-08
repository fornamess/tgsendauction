import mongoose from 'mongoose';
import { ITransaction, Transaction, TransactionType } from '../models/Transaction.model';
import { User } from '../models/User.model';
import { NotFoundError, InsufficientFundsError } from '../utils/errors';

export class TransactionService {
  /**
   * Создать транзакцию и обновить баланс пользователя
   * Использует транзакции только если передана session (для критичных операций типа BET)
   * Для простых операций (DEPOSIT, REFUND, PRIZE) транзакции не используются
   */
  static async createTransaction(
    userId: mongoose.Types.ObjectId,
    type: TransactionType,
    amount: number,
    roundId?: mongoose.Types.ObjectId,
    betId?: mongoose.Types.ObjectId,
    description?: string,
    session?: mongoose.ClientSession
  ): Promise<ITransaction> {
    // Не используем транзакции в standalone MongoDB
    // Используем атомарные операции MongoDB ($inc) для безопасности

    try {
      // Обновить баланс пользователя в зависимости от типа транзакции
      let updateField: any = {};

      switch (type) {
        case TransactionType.BET:
        case TransactionType.DEPOSIT:
          // Для ставки и пополнения изменяем balance
          updateField = { $inc: { balance: type === TransactionType.BET ? -amount : amount } };
          break;
        case TransactionType.REFUND:
          updateField = { $inc: { balance: amount } };
          break;
        case TransactionType.PRIZE:
          // Для приза добавляем робуксы
          updateField = { $inc: { robux: amount } };
          break;
      }

      // Проверить баланс перед списанием (для BET)
      if (type === TransactionType.BET) {
        const user = await User.findById(userId);
        if (!user) {
          throw new NotFoundError('Пользователь', userId.toString());
        }
        if (user.balance < amount) {
          throw new InsufficientFundsError(amount, user.balance);
        }
      }

      // Обновить баланс/робуксы пользователя атомарной операцией
      // Используем findOneAndUpdate с условием для предотвращения отрицательного баланса
      let userResult;
      if (type === TransactionType.BET) {
        // Для ставки используем условие, чтобы баланс не стал отрицательным
        userResult = await User.findOneAndUpdate(
          { _id: userId, balance: { $gte: amount } }, // Условие: баланс >= суммы
          updateField,
          { new: true }
        );
        if (!userResult) {
          // Проверяем, почему не обновилось
          const user = await User.findById(userId);
          if (!user) {
            throw new NotFoundError('Пользователь', userId.toString());
          }
          throw new InsufficientFundsError(amount, user.balance);
        }
      } else {
        // Для других операций просто обновляем
        userResult = await User.findByIdAndUpdate(userId, updateField, { new: true });
        if (!userResult) {
          throw new NotFoundError('Пользователь', userId.toString());
        }
      }

      // Создать транзакцию
      const transaction = new Transaction({
        userId,
        type,
        amount,
        roundId,
        betId,
        description,
      });

      await transaction.save();

      return transaction;
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * Получить историю транзакций пользователя
   */
  static async getUserTransactions(
    userId: mongoose.Types.ObjectId,
    limit: number = 50,
    skip: number = 0
  ): Promise<ITransaction[]> {
    return Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('roundId')
      .exec();
  }
}
