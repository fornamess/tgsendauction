import { ObjectId } from 'mongodb';
import {
  DEFAULT_REWARD_AMOUNT,
  DEFAULT_ROUND_DURATION_MINUTES,
  DEFAULT_TOTAL_ROUNDS,
  DEFAULT_WINNERS_PER_ROUND,
} from '../constants/auction';
import { getAuctionCollection, IAuctionMongo, AuctionStatus } from '../models/mongodb/Auction.collection';
import { getRoundCollection, RoundStatus } from '../models/mongodb/Round.collection';
import { ConflictError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { auctionCache } from '../utils/redisCache';

/**
 * Оптимизированная версия AuctionService с использованием MongoDB native driver
 * Используется для критичных операций, требующих высокой производительности
 */
export class AuctionServiceMongo {
  /**
   * Получить текущий активный аукцион (оптимизированная версия)
   */
  static async getCurrentAuction(): Promise<IAuctionMongo | null> {
    const cacheKey = 'currentAuction';
    
    return await auctionCache.getOrSet(
      cacheKey,
      async () => {
        const collection = getAuctionCollection();
        const auction = await collection.findOne({ status: AuctionStatus.ACTIVE });
        return auction;
      },
      5000 // 5 секунд TTL
    );
  }

  /**
   * Получить аукцион по ID (оптимизированная версия)
   */
  static async getAuctionById(auctionId: string): Promise<IAuctionMongo | null> {
    try {
      const collection = getAuctionCollection();
      const auction = await collection.findOne({ _id: new ObjectId(auctionId) });
      return auction;
    } catch (error) {
      logger.error('Ошибка получения аукциона по ID', error, { auctionId });
      return null;
    }
  }

  /**
   * Обновить статус аукциона (оптимизированная версия)
   */
  static async updateAuctionStatus(
    auctionId: string,
    status: AuctionStatus,
    endedAt?: Date
  ): Promise<IAuctionMongo | null> {
    try {
      const collection = getAuctionCollection();
      const update: any = { 
        status,
        updatedAt: new Date(),
      };
      
      if (endedAt) {
        update.endedAt = endedAt;
      }

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(auctionId) },
        { $set: update },
        { returnDocument: 'after' }
      );

      if (result) {
        await auctionCache.clear();
      }

      return result;
    } catch (error) {
      logger.error('Ошибка обновления статуса аукциона', error, { auctionId, status });
      throw error;
    }
  }

  /**
   * Завершить все активные раунды аукциона (оптимизированная версия)
   */
  static async endActiveRounds(auctionId: string): Promise<number> {
    try {
      const roundCollection = getRoundCollection();
      const result = await roundCollection.updateMany(
        { 
          auctionId: new ObjectId(auctionId),
          status: RoundStatus.ACTIVE 
        },
        { 
          $set: { 
            status: RoundStatus.ENDED,
            updatedAt: new Date(),
          } 
        }
      );
      return result.modifiedCount;
    } catch (error) {
      logger.error('Ошибка завершения активных раундов', error, { auctionId });
      throw error;
    }
  }
}
