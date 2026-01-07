import { Response } from 'express';
import { User } from '../models/User.model';
import { TransactionService } from '../services/TransactionService';
import { TransactionType } from '../models/Transaction.model';
import { BetService } from '../services/BetService';
import { AuthRequest } from '../utils/auth';

export class UserController {
  /**
   * Получить профиль текущего пользователя
   */
  static async getMe(req: AuthRequest, res: Response) {
    try {
      if (!req.userId || !req.user) {
        return res.status(401).json({ error: 'Необходима авторизация' });
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
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Ошибка получения профиля' });
    }
  }

  /**
   * Пополнить баланс (для тестов)
   */
  static async deposit(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Необходима авторизация' });
      }

      const { amount } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Неверная сумма пополнения' });
      }

      await TransactionService.createTransaction(
        req.userId,
        TransactionType.DEPOSIT,
        amount,
        undefined,
        undefined,
        'Пополнение баланса'
      );

      const user = await User.findById(req.userId);
      res.json({ user, message: 'Баланс успешно пополнен' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Ошибка пополнения баланса' });
    }
  }

  /**
   * Получить пользователя по ID
   */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Ошибка получения пользователя' });
    }
  }
}
