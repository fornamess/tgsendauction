import mongoose, { Schema, Document } from 'mongoose';

export interface IWinner extends Document {
  userId: mongoose.Types.ObjectId;
  roundId: mongoose.Types.ObjectId;
  betId: mongoose.Types.ObjectId;
  rank: number; // Место в топ-100 (1-100)
  prizeRobux: number;
  createdAt: Date;
}

const WinnerSchema = new Schema<IWinner>(
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
    betId: {
      type: Schema.Types.ObjectId,
      ref: 'Bet',
      required: true,
    },
    rank: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    prizeRobux: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

WinnerSchema.index({ userId: 1, roundId: 1 }, { unique: true });
WinnerSchema.index({ roundId: 1, rank: 1 });

export const Winner = mongoose.model<IWinner>('Winner', WinnerSchema);
