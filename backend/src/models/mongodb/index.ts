// Инициализация всех индексов MongoDB
import { createUserIndexes } from './User.collection';
import { createAuctionIndexes } from './Auction.collection';
import { createRoundIndexes } from './Round.collection';
import { createBetIndexes } from './Bet.collection';
import { logger } from '../../utils/logger';

export const initializeMongoIndexes = async (): Promise<void> => {
  try {
    await Promise.all([
      createUserIndexes(),
      createAuctionIndexes(),
      createRoundIndexes(),
      createBetIndexes(),
    ]);
    logger.info('✅ MongoDB индексы созданы');
  } catch (error) {
    logger.error('❌ Ошибка создания MongoDB индексов', error);
    throw error;
  }
};
