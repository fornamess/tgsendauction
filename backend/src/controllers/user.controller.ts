import { Response } from 'express';
import { User } from '../models/User.model';
import { TransactionService } from '../services/TransactionService';
import { TransactionType } from '../models/Transaction.model';
import { BetService } from '../services/BetService';
import { AuthRequest } from '../utils/auth';
import { UnauthorizedError } from '../utils/errors';
import { depositSchema } from '../utils/validation';

export class UserController {
  /**
   * Получить профиль текущего пользователя
   */
  static async getMe(req: AuthRequest, res: Response) {
    if (!req.userId || !req.user) {
      throw new UnauthorizedError();
    }

    // Получить историю транзакций
    const transactions = await TransactionService.getUserTransactions(req.userId, 20);

    // Получить ставки пользователя
    const bets = await BetService.getUserBets(req.userId);

    res.json({
      user: req.user,
      transactions,
      bets: bets.slice(0, 20), // Последние 20 ставок
    });
  }

  /**
   * Пополнить баланс (для тестов)
   */
  static async deposit(req: AuthRequest, res: Response) {
    if (!req.userId) {
      throw new UnauthorizedError();
    }

    const { amount } = depositSchema.parse(req.body);

    await TransactionService.createTransaction(
      req.userId,
      TransactionType.DEPOSIT,
      amount,
      undefined,
      undefined,
      'Пополнение баланса'
    );

    const user = await User.findById(req.userId);
    if (!user) {
      throw new Error('Пользователь не найден после пополнения');
    }

    res.json({ user, message: 'Баланс успешно пополнен' });
  }

  /**
   * Получить пользователя по ID
   */
  static async getById(req: AuthRequest, res: Response) {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json(user);
  }
}
