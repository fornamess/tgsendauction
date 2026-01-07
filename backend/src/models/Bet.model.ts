import mongoose, { Schema, Document } from 'mongoose';

export interface IBet extends Document {
  userId: mongoose.Types.ObjectId;
  roundId: mongoose.Types.ObjectId;
  amount: number; // Сумма ставки в рублях
  createdAt: Date;
  updatedAt: Date;
  version: number; // Для оптимистичной блокировки
}

const BetSchema = new Schema<IBet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    roundId: {
      type: Schema.Types.ObjectId,
      ref: 'Round',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    version: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Индекс для обеспечения одной ставки пользователя на раунд
BetSchema.index({ userId: 1, roundId: 1 }, { unique: true });
BetSchema.index({ roundId: 1, amount: -1 }); // Для сортировки топ-100

export const Bet = mongoose.model<IBet>('Bet', BetSchema);
