import mongoose, { Schema, Document } from 'mongoose';

export enum AuctionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export interface IAuction extends Document {
  name: string;
  prizeRobux?: number; // Deprecated: использовать rewardAmount
  rewardAmount: number; // Количество робуксов за приз
  winnersPerRound: number; // Количество победителей в раунде
  totalRounds: number; // Всего раундов в аукционе
  roundDurationMinutes: number; // Длительность раунда в минутах
  status: AuctionStatus;
  createdAt: Date;
  endedAt?: Date;
}

const AuctionSchema = new Schema<IAuction>(
  {
    name: {
      type: String,
      required: true,
    },
    prizeRobux: {
      type: Number,
      required: false,
      default: 1000,
      min: 1,
    },
    rewardAmount: {
      type: Number,
      required: true,
      default: 1000,
      min: 1,
    },
    winnersPerRound: {
      type: Number,
      required: true,
      default: 100,
      min: 1,
    },
    totalRounds: {
      type: Number,
      required: true,
      default: 30,
      min: 1,
    },
    roundDurationMinutes: {
      type: Number,
      required: true,
      default: 60,
      min: 1,
    },
    status: {
      type: String,
      enum: Object.values(AuctionStatus),
      default: AuctionStatus.DRAFT,
      required: true,
    },
    endedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

AuctionSchema.index({ status: 1 });

export const Auction = mongoose.model<IAuction>('Auction', AuctionSchema);
