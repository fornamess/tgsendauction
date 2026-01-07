import { Response } from 'express';
import { RoundService } from '../services/RoundService';
import { RankingService } from '../services/RankingService';
import { AuthRequest } from '../utils/auth';

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
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Ошибка получения раунда' });
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
        return res.status(404).json({ error: 'Раунд не найден' });
      }

      const top100 = await RankingService.getCurrentTop100(roundId);

      res.json({
        round,
        top100,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Ошибка получения раунда' });
    }
  }
}
