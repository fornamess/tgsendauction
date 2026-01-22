import mongoose from 'mongoose';
import { BetService } from '../services/BetService';
import { AuctionService } from '../services/AuctionService';
import { RoundService } from '../services/RoundService';
import { TransactionService } from '../services/TransactionService';
import { User } from '../models/User.model';
import { Bet } from '../models/Bet.model';
import { Round } from '../models/Round.model';
import { TransactionType } from '../models/Transaction.model';
import {
  NotFoundError,
  ConflictError,
  InsufficientFundsError,
  ValidationError,
} from '../utils/errors';

describe('BetService', () => {
  let userId: mongoose.Types.ObjectId;
  let auctionId: string;

  // Функция для получения текущего раунда (получаем заново каждый раз)
  const getCurrentRoundId = async (): Promise<mongoose.Types.ObjectId> => {
    const round = await RoundService.getCurrentRound();
    if (!round) {
      throw new Error('Раунд должен быть создан автоматически при запуске аукциона');
    }
    return round._id;
  };

  beforeEach(async () => {
    // Создать пользователя с балансом
    const user = new User({
      username: `test_user_${Date.now()}`,
      balance: 100000, // 100000 рублей
      robux: 0,
    });
    await user.save();
    userId = user._id;

    // Создать аукцион
    const draft = await AuctionService.createAuction('Тест', 1000, 100, 30, 60);
    auctionId = draft._id.toString();
    await AuctionService.startAuction(auctionId);
    // startAuction автоматически создает первый раунд
  });

  describe('placeBet', () => {
    it('должен разместить новую ставку', async () => {
      const roundId = await getCurrentRoundId();
      const bet = await BetService.placeBet(userId, roundId, 10000);

      expect(bet).toBeDefined();
      expect(bet.amount).toBe(10000);
      expect(bet.userId.toString()).toBe(userId.toString());
      expect(bet.roundId.toString()).toBe(roundId.toString());

      // Проверить, что баланс уменьшился
      const user = await User.findById(userId);
      expect(user?.balance).toBe(90000);

      // Проверить транзакцию
      const transactions = await (
        await import('../models/Transaction.model')
      ).Transaction.find({ userId, type: TransactionType.BET });
      expect(transactions.length).toBe(1);
      expect(transactions[0].amount).toBe(10000);
    });

    it('должен повысить существующую ставку', async () => {
      const roundId = await getCurrentRoundId();
      await BetService.placeBet(userId, roundId, 10000);

      const updatedBet = await BetService.placeBet(userId, roundId, 20000);

      expect(updatedBet.amount).toBe(20000);

      // Проверить, что баланс уменьшился только на разницу
      const user = await User.findById(userId);
      expect(user?.balance).toBe(80000); // 100000 - 20000

      // Проверить транзакции
      const transactions = await (
        await import('../models/Transaction.model')
      ).Transaction.find({ userId, type: TransactionType.BET }).sort({ createdAt: 1 });
      expect(transactions.length).toBe(2);
      expect(transactions[0].amount).toBe(10000);
      expect(transactions[1].amount).toBe(10000); // Разница
    });

    it('не должен принять ставку меньше текущей', async () => {
      const roundId = await getCurrentRoundId();
      await BetService.placeBet(userId, roundId, 10000);

      await expect(
        BetService.placeBet(userId, roundId, 5000)
      ).rejects.toThrow(ValidationError);
    });

    it('не должен принять ставку, если недостаточно средств', async () => {
      const roundId = await getCurrentRoundId();
      await expect(
        BetService.placeBet(userId, roundId, 200000)
      ).rejects.toThrow(InsufficientFundsError);
    });

    it('не должен принять ставку в неактивный раунд', async () => {
      const roundId = await getCurrentRoundId();
      await RoundService.endRound(roundId.toString());

      await expect(
        BetService.placeBet(userId, roundId, 10000)
      ).rejects.toThrow(ConflictError);
    });

    it('не должен принять ставку от несуществующего пользователя', async () => {
      const roundId = await getCurrentRoundId();
      const fakeUserId = new mongoose.Types.ObjectId();

      await expect(
        BetService.placeBet(fakeUserId, roundId, 10000)
      ).rejects.toThrow(NotFoundError);
    });

    it('не должен принять ставку в несуществующий раунд', async () => {
      const fakeRoundId = new mongoose.Types.ObjectId();

      await expect(
        BetService.placeBet(userId, fakeRoundId, 10000)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getUserBet', () => {
    it('должен вернуть ставку пользователя', async () => {
      const roundId = await getCurrentRoundId();
      await BetService.placeBet(userId, roundId, 10000);

      const bet = await BetService.getUserBet(userId, roundId);

      expect(bet).toBeDefined();
      expect(bet?.amount).toBe(10000);
      // userId может быть объектом из-за populate
      const betUserIdStr = typeof bet?.userId === 'object' && bet.userId?._id
        ? bet.userId._id.toString()
        : bet?.userId?.toString() || '';
      expect(betUserIdStr).toBe(userId.toString());
    });

    it('должен вернуть null, если ставки нет', async () => {
      const roundId = await getCurrentRoundId();
      const bet = await BetService.getUserBet(userId, roundId);

      expect(bet).toBeNull();
    });
  });

  describe('idempotency', () => {
    it('должен обработать дублирующиеся запросы с одинаковым ключом', async () => {
      const roundId = await getCurrentRoundId();
      // Используем уникальный ключ для каждого теста
      const idempotencyKey = `test-key-idempotency-${Date.now()}-${Math.random()}`;

      // Первый запрос должен пройти успешно
      const bet1 = await BetService.placeBet(userId, roundId, 10000, idempotencyKey);
      
      // Второй запрос с тем же ключом должен вернуть ту же ставку (идемпотентность)
      const bet2 = await BetService.placeBet(userId, roundId, 10000, idempotencyKey);

      // Оба должны вернуть одну и ту же ставку
      expect(bet1._id.toString()).toBe(bet2._id.toString());

      // Проверить, что создана только одна транзакция
      const transactions = await (
        await import('../models/Transaction.model')
      ).Transaction.find({ userId, type: TransactionType.BET });
      expect(transactions.length).toBe(1);
    });
  });
});
