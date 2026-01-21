import { Response } from 'express';
import { IAuction } from '../models/Auction.model';
import { RoundService } from '../services/RoundService';
import { RankingService } from '../services/RankingService';
import { AuthRequest } from '../utils/auth';
import { NotFoundError } from '../utils/errors';

export class RoundController {
  /**
   * Получить текущий активный раунд с топ-100
   */
  static async getCurrent(req: AuthRequest, res: Response) {
    try {
      const round = await RoundService.getCurrentRound();
      if (!round) {
        return res.status(404).json({ error: 'Активный раунд не найден' });
      }

      const auction = round.auctionId as unknown as IAuction;
      const winnersPerRound = auction?.winnersPerRound || 100;
    const top100 = await RankingService.getCurrentTop100(
      round._id.toString(),
      winnersPerRound
    );

    // Получить ставку текущего пользователя, если авторизован
    let userBet = null;
    let userRank = null;
    if (req.userId) {
      const { BetService } = await import('../services/BetService');
      userBet = await BetService.getUserBet(req.userId, round._id);
      userRank = await RankingService.getUserRank(req.userId, round._id.toString());
    }

      res.json({
        round,
        top100,
        userBet,
        userRank,
        winnersPerRound,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Ошибка получения раунда';
      return res.status(500).json({ error: message });
    }
  }

  /**
   * Получить раунд по ID
   */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const { roundId } = req.params;
      const round = await RoundService.getRoundById(roundId);
      if (!round) {
        throw new NotFoundError('Раунд', roundId);
      }

      const auction = round.auctionId as unknown as IAuction;
      const winnersPerRound = auction?.winnersPerRound || 100;
      const top100 = await RankingService.getCurrentTop100(roundId, winnersPerRound);

      res.json({
        round,
        top100,
        winnersPerRound,
      });
    } catch (error: unknown) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Ошибка получения раунда';
      return res.status(500).json({ error: message });
    }
  }
}
