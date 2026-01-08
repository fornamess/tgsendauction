import { Response } from 'express';
import { RoundService } from '../services/RoundService';
import { RankingService } from '../services/RankingService';
import { AuthRequest } from '../utils/auth';
import { NotFoundError } from '../utils/errors';

export class RoundController {
  /**
   * Получить текущий активный раунд с топ-100
   */
  static async getCurrent(req: AuthRequest, res: Response) {
    const round = await RoundService.getCurrentRound();
    if (!round) {
      return res.status(404).json({ error: 'Активный раунд не найден' });
    }

    const top100 = await RankingService.getCurrentTop100(round._id.toString());

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
    });
  }

  /**
   * Получить раунд по ID
   */
  static async getById(req: AuthRequest, res: Response) {
    const { roundId } = req.params;
    const round = await RoundService.getRoundById(roundId);
    if (!round) {
      throw new NotFoundError('Раунд', roundId);
    }

    const top100 = await RankingService.getCurrentTop100(roundId);

    res.json({
      round,
      top100,
    });
  }
}
