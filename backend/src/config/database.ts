import mongoose from 'mongoose';
import { logger } from '../utils/logger';

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/auction_db';
    await mongoose.connect(mongoUri);
    logger.info('✅ MongoDB подключена', { mongoUri });
  } catch (error) {
    logger.error('❌ Ошибка подключения к MongoDB', error);
    process.exit(1);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info('MongoDB отключена');
};
