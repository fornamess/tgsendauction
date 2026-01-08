import mongoose, { Schema, Document } from 'mongoose';

export enum TransactionType {
  BET = 'bet', // Ставка
  REFUND = 'refund', // Возврат средств
  PRIZE = 'prize', // Начисление приза (робуксов)
  DEPOSIT = 'deposit', // Пополнение баланса
}

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  type: TransactionType;
  amount: number;
  roundId?: mongoose.Types.ObjectId;
  betId?: mongoose.Types.ObjectId;
  description?: string;
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    roundId: {
      type: Schema.Types.ObjectId,
      ref: 'Round',
    },
    betId: {
      type: Schema.Types.ObjectId,
      ref: 'Bet',
    },
    description: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

TransactionSchema.index({ userId: 1, createdAt: -1 }); // История пользователя
TransactionSchema.index({ roundId: 1 }); // Транзакции раунда
TransactionSchema.index({ type: 1 }); // Фильтрация по типу
TransactionSchema.index({ userId: 1, type: 1 }); // Композитный индекс для запросов пользователя по типу
TransactionSchema.index({ betId: 1 }); // Связь с ставкой

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);
