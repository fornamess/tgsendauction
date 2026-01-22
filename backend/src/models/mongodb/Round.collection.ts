import { ObjectId, Collection } from 'mongodb';
import { getMongoDB } from '../../config/mongodb';

export enum RoundStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  ENDED = 'ended',
}

export interface IRoundMongo {
  _id?: ObjectId;
  auctionId: ObjectId;
  number: number;
  status: RoundStatus;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const getRoundCollection = (): Collection<IRoundMongo> => {
  const db = getMongoDB();
  return db.collection<IRoundMongo>('rounds');
};

// Создание индексов
export const createRoundIndexes = async (): Promise<void> => {
  const collection = getRoundCollection();
  await collection.createIndex({ auctionId: 1, number: 1 }, { unique: true });
  await collection.createIndex({ status: 1, endTime: 1 });
  await collection.createIndex({ auctionId: 1, status: 1 });
  await collection.createIndex({ endTime: 1 });
};
