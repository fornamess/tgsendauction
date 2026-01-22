import { ObjectId, Collection } from 'mongodb';
import { getMongoDB } from '../../config/mongodb';

export enum AuctionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export interface IAuctionMongo {
  _id?: ObjectId;
  name: string;
  rewardAmount: number;
  winnersPerRound: number;
  totalRounds: number;
  roundDurationMinutes: number;
  status: AuctionStatus;
  createdAt: Date;
  updatedAt: Date;
  endedAt?: Date;
  refundsProcessed?: boolean;
}

export const getAuctionCollection = (): Collection<IAuctionMongo> => {
  const db = getMongoDB();
  return db.collection<IAuctionMongo>('auctions');
};

// Создание индексов
export const createAuctionIndexes = async (): Promise<void> => {
  const collection = getAuctionCollection();
  await collection.createIndex({ status: 1 });
};
