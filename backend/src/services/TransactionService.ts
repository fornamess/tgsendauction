import mongoose from 'mongoose';
import { ITransaction, Transaction, TransactionType } from '../models/Transaction.model';
import { User } from '../models/User.model';

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
    // Используем транзакции только если передана внешняя сессия (для BET)
    const useTransactions = session !== undefined;
    let sessionToUse = session;
    let shouldCommit = false;

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

      // Проверить баланс перед списанием
      if (type === TransactionType.BET) {
        const user = await User.findById(userId).session(sessionToUse || undefined);
        if (!user) {
          throw new Error('Пользователь не найден');
        }
        if (user.balance < amount) {
          throw new Error('Недостаточно средств на балансе');
        }
      }

      // Обновить баланс/робуксы пользователя
      const userResult = await User.findByIdAndUpdate(userId, updateField, {
        new: true,
        session: sessionToUse || undefined,
      });

      if (!userResult) {
        throw new Error('Не удалось обновить баланс пользователя');
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

      await transaction.save({ session: sessionToUse || undefined });

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
