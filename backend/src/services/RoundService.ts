import { Round, IRound, RoundStatus } from '../models/Round.model';
import { Auction, AuctionStatus } from '../models/Auction.model';

const ROUND_DURATION_MS = 60 * 60 * 1000; // 60 минут

export class RoundService {
  /**
   * Создать новый раунд для активного аукциона
   */
  static async createNextRound(): Promise<IRound | null> {
    // Найти активный аукцион
    const auction = await Auction.findOne({ status: AuctionStatus.ACTIVE });
    if (!auction) {
      return null; // Нет активного аукциона
    }

    // Найти последний раунд этого аукциона
    const lastRound = await Round.findOne({ auctionId: auction._id })
      .sort({ number: -1 })
      .exec();

    const roundNumber = lastRound ? lastRound.number + 1 : 1;

    // Вычислить время начала и окончания
    const now = new Date();
    const startTime = now;
    const endTime = new Date(now.getTime() + ROUND_DURATION_MS);

    // Если есть активный раунд, завершить его
    const activeRound = await Round.findOne({
      auctionId: auction._id,
      status: RoundStatus.ACTIVE,
    });

    if (activeRound) {
      await this.endRound(activeRound._id.toString());
    }

    // Создать новый раунд
    const round = new Round({
      auctionId: auction._id,
      number: roundNumber,
      status: RoundStatus.ACTIVE,
      startTime,
      endTime,
    });

    return await round.save();
  }

  /**
   * Получить текущий активный раунд
   */
  static async getCurrentRound(auctionId?: string): Promise<IRound | null> {
    let query: any = { status: RoundStatus.ACTIVE };

    if (auctionId) {
      query.auctionId = auctionId;
    } else {
      // Найти активный аукцион
      const auction = await Auction.findOne({ status: AuctionStatus.ACTIVE });
      if (!auction) {
        return null;
      }
      query.auctionId = auction._id;
    }

    return await Round.findOne(query)
      .populate('auctionId')
      .exec();
  }

  /**
   * Завершить раунд
   */
  static async endRound(roundId: string): Promise<IRound> {
    const round = await Round.findById(roundId);
    if (!round) {
      throw new Error('Раунд не найден');
    }

    if (round.status === RoundStatus.ENDED) {
      return round; // Уже завершен
    }

    round.status = RoundStatus.ENDED;
    return await round.save();
  }

  /**
   * Получить раунд по ID
   */
  static async getRoundById(roundId: string): Promise<IRound | null> {
    return await Round.findById(roundId).populate('auctionId').exec();
  }

  /**
   * Получить все раунды аукциона
   */
  static async getRoundsByAuction(auctionId: string): Promise<IRound[]> {
    return await Round.find({ auctionId }).sort({ number: 1 }).exec();
  }

  /**
   * Проверить, активен ли раунд
   */
  static async isRoundActive(roundId: string): Promise<boolean> {
    const round = await Round.findById(roundId);
    if (!round) {
      return false;
    }

    const now = new Date();
    return (
      round.status === RoundStatus.ACTIVE &&
      now >= round.startTime &&
      now <= round.endTime
    );
  }
}
