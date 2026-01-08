import mongoose, { Schema, Document } from 'mongoose';

export enum RoundStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export interface IRound extends Document {
  auctionId: mongoose.Types.ObjectId;
  number: number; // Номер раунда (1, 2, 3...)
  status: RoundStatus;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RoundSchema = new Schema<IRound>(
  {
    auctionId: {
      type: Schema.Types.ObjectId,
      ref: 'Auction',
      required: true,
    },
    number: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: Object.values(RoundStatus),
      default: RoundStatus.PENDING,
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

RoundSchema.index({ auctionId: 1, number: 1 }, { unique: true });
RoundSchema.index({ status: 1, endTime: 1 }); // Для планировщика
RoundSchema.index({ auctionId: 1, status: 1 }); // Для поиска активных раундов аукциона
RoundSchema.index({ endTime: 1 }); // Для сортировки по времени окончания

export const Round = mongoose.model<IRound>('Round', RoundSchema);
