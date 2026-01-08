import { Response } from 'express';
import { BetService } from '../services/BetService';
import { AuthRequest } from '../utils/auth';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import { placeBetSchema } from '../utils/validation';

export class BetController {
  /**
   * Разместить или повысить ставку
   */
  static async placeBet(req: AuthRequest, res: Response) {
    if (!req.userId) {
      throw new UnauthorizedError();
    }

    const { amount, roundId } = placeBetSchema.parse(req.body);

    const bet = await BetService.placeBet(req.userId, roundId, amount);
    res.json(bet);
  }

  /**
   * Получить ставку пользователя в текущем раунде
   */
  static async getMyBet(req: AuthRequest, res: Response) {
    if (!req.userId) {
      throw new UnauthorizedError();
    }

    const { roundId } = req.query;
    if (!roundId || typeof roundId !== 'string') {
      throw new ValidationError('Не указан roundId');
    }

    const bet = await BetService.getUserBet(req.userId, roundId);
    if (!bet) {
      return res.status(404).json({ error: 'Ставка не найдена' });
    }

    res.json(bet);
  }
}
