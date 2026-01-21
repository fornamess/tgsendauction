import mongoose from 'mongoose';
import { ITransaction, Transaction, TransactionType } from '../models/Transaction.model';
import { User } from '../models/User.model';
import { IdempotentRequest, IdempotentStatus } from '../models/IdempotentRequest.model';
import { ConflictError, NotFoundError, InsufficientFundsError } from '../utils/errors';

export class TransactionService {
  /**
   * Создать транзакцию и обновить баланс пользователя
   * Использует атомарные операции MongoDB для безопасности
   */
  static async createTransaction(
    userId: mongoose.Types.ObjectId,
    type: TransactionType,
    amount: number,
    roundId?: mongoose.Types.ObjectId,
    betId?: mongoose.Types.ObjectId,
    description?: string,
    idempotencyKey?: string
  ): Promise<ITransaction> {
    // Если передан idempotencyKey, сначала проверяем предыдущий результат
    if (idempotencyKey) {
      const existing = await IdempotentRequest.findOne({
        key: idempotencyKey,
        type,
      }).exec();

      if (existing) {
        if (existing.status === IdempotentStatus.SUCCEEDED && existing.resultId) {
          const existingTx = await Transaction.findById(existing.resultId).exec();
          if (existingTx) {
            return existingTx;
          }
        }

        if (existing.status === IdempotentStatus.PENDING) {
          throw new ConflictError('Операция уже обрабатывается, повторите запрос позже.');
        }
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    // Храним ссылку на документ идемпотентности, если он используется
    let idempotentDoc: InstanceType<typeof IdempotentRequest> | null = null;

    try {
      if (idempotencyKey) {
        const doc = await IdempotentRequest.findOneAndUpdate(
          { key: idempotencyKey, type },
          {
            $setOnInsert: {
              status: IdempotentStatus.PENDING,
            },
          },
          {
            new: true,
            upsert: true,
            session,
          }
        );
        idempotentDoc = doc;

        if (doc.status === IdempotentStatus.SUCCEEDED && doc.resultId) {
          const existingTx = await Transaction.findById(doc.resultId).session(session);
          if (existingTx) {
            await session.commitTransaction();
            session.endSession();
            return existingTx;
          }
        }

        if (doc.status === IdempotentStatus.PENDING && !doc.isNew) {
          throw new ConflictError('Операция уже обрабатывается, повторите запрос позже.');
        }
      }

      // Обновить баланс пользователя в зависимости от типа транзакции
      let updateField: { $inc: { balance?: number; robux?: number } };

      switch (type) {
        case TransactionType.BET:
        case TransactionType.DEPOSIT:
          updateField = { $inc: { balance: type === TransactionType.BET ? -amount : amount } };
          break;
        case TransactionType.REFUND:
          updateField = { $inc: { balance: amount } };
          break;
        case TransactionType.PRIZE:
          updateField = { $inc: { robux: amount } };
          break;
      }

      // Проверить баланс перед списанием (для BET)
      if (type === TransactionType.BET) {
        const user = await User.findById(userId).session(session);
        if (!user) {
          throw new NotFoundError('Пользователь', userId.toString());
        }
        if (user.balance < amount) {
          throw new InsufficientFundsError(amount, user.balance);
        }
      }

      // Обновить баланс/робуксы пользователя атомарной операцией
      let userResult;
      if (type === TransactionType.BET) {
        userResult = await User.findOneAndUpdate(
          { _id: userId, balance: { $gte: amount } },
          updateField,
          { new: true, session }
        );
        if (!userResult) {
          const user = await User.findById(userId).session(session);
          if (!user) {
            throw new NotFoundError('Пользователь', userId.toString());
          }
          throw new InsufficientFundsError(amount, user.balance);
        }
      } else {
        userResult = await User.findByIdAndUpdate(userId, updateField, { new: true, session });
        if (!userResult) {
          throw new NotFoundError('Пользователь', userId.toString());
        }
      }

      const transaction = new Transaction({
        userId,
        type,
        amount,
        roundId,
        betId,
        description,
      });

      await transaction.save({ session });

      if (idempotentDoc) {
        idempotentDoc.status = IdempotentStatus.SUCCEEDED;
        idempotentDoc.resultType = 'Transaction';
        idempotentDoc.resultId = transaction._id;
        await idempotentDoc.save({ session });
      }

      await session.commitTransaction();
      session.endSession();

      return transaction;
    } catch (error: unknown) {
      await session.abortTransaction();
      session.endSession();

      if (idempotencyKey) {
        await IdempotentRequest.updateOne(
          { key: idempotencyKey, type },
          {
            status: IdempotentStatus.FAILED,
            errorMessage: error instanceof Error ? error.message : String(error),
          }
        ).exec();
      }

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
