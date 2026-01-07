import mongoose, { Schema, Document } from 'mongoose';

export enum AuctionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export interface IAuction extends Document {
  name: string;
  prizeRobux: number; // Количество робуксов за приз (1000)
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
      required: true,
      default: 1000,
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
