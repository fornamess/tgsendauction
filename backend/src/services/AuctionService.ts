import { Auction, IAuction, AuctionStatus } from '../models/Auction.model';
import { Round, IRound, RoundStatus } from '../models/Round.model';
import { ConflictError, NotFoundError } from '../utils/errors';

export class AuctionService {
  /**
   * Создать новый аукцион
   */
  static async createAuction(
    name: string,
    rewardAmount: number = 1000,
    winnersPerRound: number = 100,
    totalRounds: number = 30,
    roundDurationMinutes: number = 60
  ): Promise<IAuction> {
    // Проверить, нет ли активного аукциона
    const activeAuction = await Auction.findOne({ status: AuctionStatus.ACTIVE });
    if (activeAuction) {
      throw new ConflictError('Уже есть активный аукцион. Завершите его перед созданием нового.');
    }

    const auction = new Auction({
      name,
      prizeRobux: rewardAmount,
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
    return await Auction.findOne({ status: AuctionStatus.ACTIVE });
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

    // Автоматически создать первый раунд при запуске аукциона
    try {
      const { RoundService } = await import('./RoundService');
      const firstRound = await RoundService.createNextRound();
      if (firstRound) {
        console.log(`✅ Автоматически создан первый раунд #${firstRound.number} для аукциона "${savedAuction.name}"`);
      }
    } catch (error) {
      console.error('⚠️ Ошибка при создании первого раунда:', error);
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
    return await auction.save();
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
      auction.prizeRobux = updates.rewardAmount;
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

    return await auction.save();
  }
}
