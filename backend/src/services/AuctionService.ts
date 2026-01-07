import { Auction, IAuction, AuctionStatus } from '../models/Auction.model';
import { Round, IRound, RoundStatus } from '../models/Round.model';

export class AuctionService {
  /**
   * Создать новый аукцион
   */
  static async createAuction(name: string, prizeRobux: number = 1000): Promise<IAuction> {
    // Проверить, нет ли активного аукциона
    const activeAuction = await Auction.findOne({ status: AuctionStatus.ACTIVE });
    if (activeAuction) {
      throw new Error('Уже есть активный аукцион. Завершите его перед созданием нового.');
    }

    const auction = new Auction({
      name,
      prizeRobux,
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
      throw new Error('Аукцион не найден');
    }

    if (auction.status !== AuctionStatus.DRAFT) {
      throw new Error('Аукцион уже запущен или завершен');
    }

    // Проверить, нет ли другого активного аукциона
    const activeAuction = await Auction.findOne({
      status: AuctionStatus.ACTIVE,
      _id: { $ne: auctionId }
    });
    if (activeAuction) {
      throw new Error('Уже есть активный аукцион');
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
      throw new Error('Аукцион не найден');
    }

    if (auction.status === AuctionStatus.ENDED) {
      throw new Error('Аукцион уже завершен');
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
}
