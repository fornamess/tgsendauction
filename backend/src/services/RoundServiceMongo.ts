import { ObjectId } from 'mongodb';
import {
  DEFAULT_TOTAL_ROUNDS,
  DEFAULT_ROUND_DURATION_MINUTES,
} from '../constants/auction';
import { getRoundCollection, IRoundMongo, RoundStatus } from '../models/mongodb/Round.collection';
import { getAuctionCollection, AuctionStatus } from '../models/mongodb/Auction.collection';
import { NotFoundError, ConflictError } from '../utils/errors';
import { roundCache } from '../utils/redisCache';

/**
 * Оптимизированная версия RoundService с использованием MongoDB native driver
 */
export class RoundServiceMongo {
  /**
   * Получить текущий активный раунд (оптимизированная версия)
   */
  static async getCurrentRound(auctionId?: string): Promise<IRoundMongo | null> {
    const cacheKey = auctionId ? `currentRound:${auctionId}` : 'currentRound:global';
    
    return await roundCache.getOrSet(
      cacheKey,
      async () => {
        const roundCollection = getRoundCollection();
        let query: any = { status: RoundStatus.ACTIVE };

        if (auctionId) {
          query.auctionId = new ObjectId(auctionId);
        } else {
          // Найти активный аукцион
          const auctionCollection = getAuctionCollection();
          const auction = await auctionCollection.findOne({ status: AuctionStatus.ACTIVE });
          if (!auction || !auction._id) {
            return null;
          }
          query.auctionId = auction._id;
        }

        const round = await roundCollection.findOne(query);
        return round;
      },
      5000 // 5 секунд TTL
    );
  }

  /**
   * Получить раунд по ID (оптимизированная версия)
   */
  static async getRoundById(roundId: string): Promise<IRoundMongo | null> {
    try {
      const collection = getRoundCollection();
      const round = await collection.findOne({ _id: new ObjectId(roundId) });
      return round;
    } catch (error) {
      return null;
    }
  }

  /**
   * Завершить раунд (оптимизированная версия)
   */
  static async endRound(roundId: string): Promise<IRoundMongo | null> {
    try {
      const collection = getRoundCollection();
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(roundId) },
        { 
          $set: { 
            status: RoundStatus.ENDED,
            updatedAt: new Date(),
          } 
        },
        { returnDocument: 'after' }
      );

      if (result) {
        await roundCache.clear();
      }

      return result;
    } catch (error) {
      throw new NotFoundError('Раунд', roundId);
    }
  }

  /**
   * Продлить время раунда (оптимизированная версия)
   */
  static async extendRoundTime(roundId: string, extensionMs: number): Promise<IRoundMongo> {
    const collection = getRoundCollection();
    const round = await collection.findOne({ _id: new ObjectId(roundId) });
    
    if (!round) {
      throw new NotFoundError('Раунд', roundId);
    }

    if (round.status !== RoundStatus.ACTIVE) {
      throw new ConflictError('Нельзя продлить неактивный раунд');
    }

    const now = new Date();
    const currentEndTime = round.endTime.getTime();
    const newEndTime = new Date(Math.max(currentEndTime, now.getTime()) + extensionMs);

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(roundId) },
      { 
        $set: { 
          endTime: newEndTime,
          updatedAt: new Date(),
        } 
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new NotFoundError('Раунд', roundId);
    }

    await roundCache.clear();
    return result;
  }
}
