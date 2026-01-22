import { Db, MongoClient, MongoClientOptions } from 'mongodb';
import { logger } from '../utils/logger';

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;

export const connectMongoDB = async (): Promise<Db> => {
  if (mongoClient && mongoDb) {
    return mongoDb;
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/auction_db';
  const dbName = process.env.MONGODB_DB_NAME || 'auction_db';

  try {
    const options: MongoClientOptions = {
      maxPoolSize: 100, // Увеличиваем пул для высокой нагрузки
      minPoolSize: 10, // Минимальный пул соединений
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      retryReads: true,
    };

    mongoClient = new MongoClient(mongoUri, options);
    await mongoClient.connect();

    mongoDb = mongoClient.db(dbName);

    // Проверяем подключение
    await mongoDb.admin().ping();

    logger.info('✅ MongoDB (native driver) подключена', {
      uri: mongoUri.replace(/\/\/.*@/, '//***@'), // Скрываем credentials в логах
      dbName
    });

    return mongoDb;
  } catch (error) {
    logger.error('❌ Ошибка подключения к MongoDB (native driver)', error);
    throw error;
  }
};

export const getMongoDB = (): Db => {
  if (!mongoDb) {
    throw new Error('MongoDB не инициализирована. Вызовите connectMongoDB() сначала.');
  }
  return mongoDb;
};

export const getMongoClient = (): MongoClient => {
  if (!mongoClient) {
    throw new Error('MongoDB клиент не инициализирован. Вызовите connectMongoDB() сначала.');
  }
  return mongoClient;
};

export const disconnectMongoDB = async (): Promise<void> => {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    mongoDb = null;
    logger.info('MongoDB (native driver) отключена');
  }
};
