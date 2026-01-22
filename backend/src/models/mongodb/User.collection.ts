import { ObjectId, Db, Collection } from 'mongodb';
import { getMongoDB } from '../../config/mongodb';

export interface IUserMongo {
  _id?: ObjectId;
  username: string;
  balance: number;
  robux: number;
  telegramId?: number;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const getUserCollection = (): Collection<IUserMongo> => {
  const db = getMongoDB();
  return db.collection<IUserMongo>('users');
};

// Создание индексов (вызывается при инициализации)
export const createUserIndexes = async (): Promise<void> => {
  const collection = getUserCollection();
  await collection.createIndex({ username: 1 }, { unique: true });
  await collection.createIndex({ telegramId: 1 }, { unique: true, sparse: true });
};
