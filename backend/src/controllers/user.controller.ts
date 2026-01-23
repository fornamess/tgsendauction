import { Response } from 'express';
import { User } from '../models/User.model';
import { TransactionService } from '../services/TransactionService';
import { TransactionType } from '../models/Transaction.model';
import { BetService } from '../services/BetService';
import { AuthRequest } from '../utils/auth';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { depositSchema, validateObjectId } from '../utils/validation';

export class UserController {
  /**
   * Получить профиль текущего пользователя
   */
  static async getMe(req: AuthRequest, res: Response) {
    try {
      if (!req.userId || !req.user) {
        throw new UnauthorizedError();
      }

      // Таймаут для запроса - 10 секунд
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );

      const result = await Promise.race([
        (async () => {
          // Параллельные запросы для оптимизации
          const [transactions, bets] = await Promise.all([
            TransactionService.getUserTransactions(req.userId!, 20),
            BetService.getUserBets(req.userId!)
          ]);

          return {
            user: req.user,
            transactions,
            bets: bets.slice(0, 20), // Последние 20 ставок
          };
        })(),
        timeoutPromise
      ]);

      res.json(result);
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Ошибка получения профиля';
      return res.status(500).json({ error: message });
    }
  }

  /**
   * Пополнить баланс (для тестов)
   */
  static async deposit(req: AuthRequest, res: Response) {
    try {
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
        return res.status(500).json({ error: 'Пользователь не найден после пополнения' });
      }

      res.json({ user, message: 'Баланс успешно пополнен' });
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Ошибка пополнения баланса';
      return res.status(500).json({ error: message });
    }
  }

  /**
   * Получить пользователя по ID
   * Пользователь может получить только свои данные, если не админ
   */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      
      // Валидация ObjectId
      const userObjectId = validateObjectId(userId, 'userId');
      
      // Проверка авторизации: пользователь может получить только свои данные
      // Админы могут получить данные любого пользователя
      if (!req.user) {
        throw new UnauthorizedError();
      }
      
      const isOwnProfile = req.userId?.toString() === userObjectId.toString();
      const isAdmin = req.user.isAdmin === true;
      
      if (!isOwnProfile && !isAdmin) {
        throw new ForbiddenError('Вы можете просматривать только свой профиль');
      }
      
      // Таймаут для запроса - 5 секунд
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 5000)
      );
      
      const user = await Promise.race([
        User.findById(userObjectId).maxTimeMS(4000).lean().exec(),
        timeoutPromise
      ]) as any;
      
      if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      res.json(user);
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Ошибка получения пользователя';
      return res.status(500).json({ error: message });
    }
  }
}
