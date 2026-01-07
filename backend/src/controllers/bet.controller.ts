import { Response } from 'express';
import { BetService } from '../services/BetService';
import { AuthRequest } from '../utils/auth';

export class BetController {
  /**
   * Разместить или повысить ставку
   */
  static async placeBet(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Необходима авторизация' });
      }

      const { amount, roundId } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Неверная сумма ставки' });
      }

      if (!roundId) {
        return res.status(400).json({ error: 'Не указан roundId' });
      }

      const bet = await BetService.placeBet(req.userId, roundId, amount);
      res.json(bet);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Ошибка размещения ставки' });
    }
  }

  /**
   * Получить ставку пользователя в текущем раунде
   */
  static async getMyBet(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Необходима авторизация' });
      }

      const { roundId } = req.query;
      if (!roundId) {
        return res.status(400).json({ error: 'Не указан roundId' });
      }

      const bet = await BetService.getUserBet(req.userId, roundId as string);
      if (!bet) {
        return res.status(404).json({ error: 'Ставка не найдена' });
      }

      res.json(bet);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Ошибка получения ставки' });
    }
  }
}
