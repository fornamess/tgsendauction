import { Response } from 'express';
import { BetService } from '../services/BetService';
import { AuthRequest } from '../utils/auth';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import { placeBetSchema, validateObjectId } from '../utils/validation';
import { recordBetFailure, recordBetSuccess } from '../utils/metrics';

export class BetController {
  /**
   * Разместить или повысить ставку
   */
  static async placeBet(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        throw new UnauthorizedError();
      }

      const { amount, roundId } = placeBetSchema.parse(req.body);

      const rawIdempotencyKey =
        (req.headers['idempotency-key'] as string | undefined) ||
        (req.headers['Idempotency-Key'] as string | undefined) ||
        (req.body && (req.body.idempotencyKey as string | undefined));

      const idempotencyKey =
        rawIdempotencyKey && rawIdempotencyKey.length > 0
          ? rawIdempotencyKey
          : undefined;

      // Валидация roundId
      const roundObjectId = validateObjectId(roundId, 'roundId');

      const result = await BetService.placeBet(
        req.userId,
        roundObjectId,
        amount,
        idempotencyKey
      );

      // Получить обновленный раунд для проверки продления времени
      const { RoundService } = await import('../services/RoundService');
      const round = await RoundService.getRoundById(roundId);

      recordBetSuccess();

      res.json({
        bet: result,
        round: round
          ? {
              _id: round._id,
              endTime: round.endTime,
              number: round.number,
            }
          : null,
      });
    } catch (error: unknown) {
      recordBetFailure();

      if (error instanceof UnauthorizedError || error instanceof ValidationError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Ошибка размещения ставки';
      return res.status(500).json({ error: message });
    }
  }

  /**
   * Получить ставку пользователя в текущем раунде
   */
  static async getMyBet(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        throw new UnauthorizedError();
      }

      const { roundId } = req.query;
      if (!roundId || typeof roundId !== 'string') {
        throw new ValidationError('Не указан roundId');
      }

      // Валидация roundId
      const roundObjectId = validateObjectId(roundId, 'roundId');

      const bet = await BetService.getUserBet(req.userId, roundObjectId);
      if (!bet) {
        return res.status(404).json({ error: 'Ставка не найдена' });
      }

      res.json(bet);
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError || error instanceof ValidationError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Ошибка получения ставки';
      return res.status(500).json({ error: message });
    }
  }
}
