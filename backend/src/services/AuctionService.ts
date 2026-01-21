import { Auction, IAuction, AuctionStatus } from '../models/Auction.model';
import { Round, RoundStatus } from '../models/Round.model';
import {
  DEFAULT_REWARD_AMOUNT,
  DEFAULT_WINNERS_PER_ROUND,
  DEFAULT_TOTAL_ROUNDS,
  DEFAULT_ROUND_DURATION_MINUTES,
} from '../constants/auction';
import { ConflictError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { SimpleCache } from '../utils/simpleCache';

const auctionCache = new SimpleCache<IAuction | null>(5 * 1000); // 5 секунд кэша

export class AuctionService {
  /**
   * Создать новый аукцион
   */
  static async createAuction(
    name: string,
    rewardAmount: number = DEFAULT_REWARD_AMOUNT,
    winnersPerRound: number = DEFAULT_WINNERS_PER_ROUND,
    totalRounds: number = DEFAULT_TOTAL_ROUNDS,
    roundDurationMinutes: number = DEFAULT_ROUND_DURATION_MINUTES
  ): Promise<IAuction> {
    // Проверить, нет ли активного или черновика аукциона
    const activeAuction = await Auction.findOne({
      status: { $in: [AuctionStatus.ACTIVE, AuctionStatus.DRAFT] },
    });
    if (activeAuction) {
      throw new ConflictError(
        `Уже есть ${activeAuction.status === 'active' ? 'активный' : 'черновик'} аукцион. Завершите или удалите его перед созданием нового.`
      );
    }

    const auction = new Auction({
      name,
      rewardAmount,
      winnersPerRound,
      totalRounds,
      roundDurationMinutes,
      status: AuctionStatus.DRAFT,
    });

    return await auction.save();
  }

  /**
   * Получить текущий активный аукцион
   */
  static async getCurrentAuction(): Promise<IAuction | null> {
    const cacheKey = 'currentAuction';
    const cached = auctionCache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const auction = await Auction.findOne({ status: AuctionStatus.ACTIVE }).exec();
    auctionCache.set(cacheKey, auction);
    return auction;
  }

  /**
   * Запустить аукцион
   */
  static async startAuction(auctionId: string): Promise<IAuction> {
    const auction = await Auction.findById(auctionId);
    if (!auction) {
      throw new NotFoundError('Аукцион', auctionId);
    }

    if (auction.status !== AuctionStatus.DRAFT) {
      throw new ConflictError(`Аукцион уже запущен или завершен. Текущий статус: ${auction.status}`);
    }

    // Проверить, нет ли другого активного аукциона
    const activeAuction = await Auction.findOne({
      status: AuctionStatus.ACTIVE,
      _id: { $ne: auctionId }
    });
    if (activeAuction) {
      throw new ConflictError('Уже есть активный аукцион');
    }

    auction.status = AuctionStatus.ACTIVE;
    const savedAuction = await auction.save();
    auctionCache.clear();

    // Автоматически создать первый раунд при запуске аукциона
    try {
      const { RoundService } = await import('./RoundService');
      const firstRound = await RoundService.createNextRound();
      if (firstRound) {
        logger.info('✅ Автоматически создан первый раунд', {
          roundNumber: firstRound.number,
          auctionId: savedAuction._id.toString(),
          auctionName: savedAuction.name,
        });
      }
    } catch (error) {
      logger.error('⚠️ Ошибка при создании первого раунда', error, {
        auctionId: savedAuction._id.toString(),
      });
      // Не бросаем ошибку, аукцион уже запущен, раунд создастся планировщиком
    }

    return savedAuction;
  }

  /**
   * Завершить аукцион
   */
  static async endAuction(auctionId: string): Promise<IAuction> {
    const auction = await Auction.findById(auctionId);
    if (!auction) {
      throw new NotFoundError('Аукцион', auctionId);
    }

    if (auction.status === AuctionStatus.ENDED) {
      throw new ConflictError('Аукцион уже завершен');
    }

    // Завершить все активные раунды
    await Round.updateMany(
      { auctionId, status: RoundStatus.ACTIVE },
      { status: RoundStatus.ENDED }
    );

    auction.status = AuctionStatus.ENDED;
    auction.endedAt = new Date();
    const saved = await auction.save();
    auctionCache.clear();
    return saved;
  }

  /**
   * Получить аукцион по ID
   */
  static async getAuctionById(auctionId: string): Promise<IAuction | null> {
    return await Auction.findById(auctionId);
  }

  /**
   * Получить все аукционы (для админки)
   */
  static async getAllAuctions(): Promise<IAuction[]> {
    return await Auction.find().sort({ createdAt: -1 }).exec();
  }

  /**
   * Обновить настройки аукциона (только черновик)
   */
  static async updateAuction(
    auctionId: string,
    updates: Partial<IAuction>
  ): Promise<IAuction> {
    const auction = await Auction.findById(auctionId);
    if (!auction) {
      throw new NotFoundError('Аукцион', auctionId);
    }

    if (auction.status !== AuctionStatus.DRAFT) {
      throw new ConflictError('Нельзя изменить настройки активного или завершенного аукциона');
    }

    if (updates.name !== undefined) {
      auction.name = updates.name;
    }
    if (updates.rewardAmount !== undefined) {
      auction.rewardAmount = updates.rewardAmount;
    }
    if (updates.winnersPerRound !== undefined) {
      auction.winnersPerRound = updates.winnersPerRound;
    }
    if (updates.totalRounds !== undefined) {
      auction.totalRounds = updates.totalRounds;
    }
    if (updates.roundDurationMinutes !== undefined) {
      auction.roundDurationMinutes = updates.roundDurationMinutes;
    }

    const saved = await auction.save();
    auctionCache.clear();
    return saved;
  }
}
