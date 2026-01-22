import { ObjectId, Collection } from 'mongodb';
import { getMongoDB } from '../../config/mongodb';

export interface IBetMongo {
  _id?: ObjectId;
  userId: ObjectId;
  roundId: ObjectId;
  amount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export const getBetCollection = (): Collection<IBetMongo> => {
  const db = getMongoDB();
  return db.collection<IBetMongo>('bets');
};

// Создание индексов
export const createBetIndexes = async (): Promise<void> => {
  const collection = getBetCollection();
  await collection.createIndex({ userId: 1, roundId: 1 }, { unique: true });
  await collection.createIndex({ roundId: 1, amount: -1 });
  await collection.createIndex({ userId: 1, createdAt: -1 });
  await collection.createIndex({ createdAt: -1 });
};
