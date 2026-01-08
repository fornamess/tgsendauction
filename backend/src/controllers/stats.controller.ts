import { Response } from 'express';
import { Bet } from '../models/Bet.model';
import { Round } from '../models/Round.model';
import { User } from '../models/User.model';
import { Winner } from '../models/Winner.model';
import { AuctionService } from '../services/AuctionService';
import { AuthRequest } from '../utils/auth';
import { NotFoundError } from '../utils/errors';

export class StatsController {
  /**
   * Получить статистику аукциона
   */
  static async getStats(req: AuthRequest, res: Response) {
    const auction = await AuctionService.getCurrentAuction();
    if (!auction) {
      return res.status(404).json({ error: 'Активный аукцион не найден' });
    }

      // Статистика раундов
      const rounds = await Round.find({ auctionId: auction._id });
      const activeRounds = rounds.filter((r: any) => r.status === 'active').length;
      const endedRounds = rounds.filter((r: any) => r.status === 'ended').length;

      // Статистика ставок
      const roundIds = rounds.map((r: any) => r._id);
      const totalBets = await Bet.countDocuments({ roundId: { $in: roundIds } });
      const totalBetAmount = await Bet.aggregate([
        { $match: { roundId: { $in: roundIds } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      const totalAmount = totalBetAmount[0]?.total || 0;

      // Статистика победителей
      const totalWinners = await Winner.countDocuments({ roundId: { $in: roundIds } });
      const uniqueWinners = await Winner.distinct('userId', { roundId: { $in: roundIds } });

      // Статистика пользователей
      const totalUsers = await User.countDocuments();

      res.json({
        auction,
        rounds: {
          total: rounds.length,
          active: activeRounds,
          ended: endedRounds,
        },
        bets: {
          total: totalBets,
          totalAmount,
        },
        winners: {
          total: totalWinners,
          unique: uniqueWinners.length,
        },
        users: {
          total: totalUsers,
      },
    });
  }
}
