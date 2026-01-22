import mongoose from 'mongoose';
import { RankingService } from '../services/RankingService';
import { AuctionService } from '../services/AuctionService';
import { RoundService } from '../services/RoundService';
import { BetService } from '../services/BetService';
import { User } from '../models/User.model';
import { Winner } from '../models/Winner.model';
import { Transaction, TransactionType } from '../models/Transaction.model';
import { NotFoundError } from '../utils/errors';

describe('RankingService', () => {
  let auctionId: string;

  // Функция для получения текущего раунда
  const getCurrentRoundId = async (): Promise<mongoose.Types.ObjectId> => {
    const round = await RoundService.getCurrentRound();
    if (!round) {
      throw new Error('Раунд должен быть создан автоматически при запуске аукциона');
    }
    return round._id;
  };

  // Функция для создания пользователей в каждом тесте
  const createTestUsers = async (count: number = 5): Promise<mongoose.Types.ObjectId[]> => {
    const userIds: mongoose.Types.ObjectId[] = [];
    for (let i = 0; i < count; i++) {
      const user = new User({
        username: `test_user_${i}_${Date.now()}_${Math.random()}`,
        balance: 100000,
        robux: 0,
      });
      await user.save();
      userIds.push(user._id);
    }
    return userIds;
  };

  beforeEach(async () => {
    // Создать аукцион
    const draft = await AuctionService.createAuction('Тест', 1000, 3, 30, 60); // 3 победителя для тестов
    const started = await AuctionService.startAuction(draft._id.toString());
    auctionId = started._id.toString();
    // startAuction автоматически создает первый раунд
  });

  describe('processRoundWinners', () => {
    it('должен определить топ-3 победителей и начислить призы', async () => {
      const users = await createTestUsers(5);
      const roundId = await getCurrentRoundId();
      // Разместить ставки
      await BetService.placeBet(users[0], roundId, 10000);
      await BetService.placeBet(users[1], roundId, 20000);
      await BetService.placeBet(users[2], roundId, 30000);
      await BetService.placeBet(users[3], roundId, 5000);
      await BetService.placeBet(users[4], roundId, 15000);

      // Завершить раунд
      await RoundService.endRound(roundId.toString());

      // Обработать победителей
      const winners = await RankingService.processRoundWinners(roundId.toString(), {
        winnersPerRound: 3,
        rewardAmount: 1000,
      });

      expect(winners.length).toBe(3);
      expect(winners[0].userId.toString()).toBe(users[2].toString()); // 30000
      expect(winners[1].userId.toString()).toBe(users[1].toString()); // 20000
      expect(winners[2].userId.toString()).toBe(users[4].toString()); // 15000

      // Проверить, что призы начислены
      for (const winner of winners) {
        const user = await User.findById(winner.userId);
        expect(user?.robux).toBe(1000);

        const transactions = await Transaction.find({
          userId: winner.userId,
          type: TransactionType.PRIZE,
        });
        expect(transactions.length).toBe(1);
        expect(transactions[0].amount).toBe(1000);
      }

      // Проверить, что 4-й и 5-й не получили призы
      const user3 = await User.findById(users[0]);
      const user4 = await User.findById(users[3]);
      expect(user3?.robux).toBe(0);
      expect(user4?.robux).toBe(0);
    });

    it('должен перенести проигравшие ставки в следующий раунд', async () => {
      const users = await createTestUsers(5);
      const roundId = await getCurrentRoundId();
      // Разместить ставки
      await BetService.placeBet(users[0], roundId, 10000);
      await BetService.placeBet(users[1], roundId, 20000);
      await BetService.placeBet(users[2], roundId, 30000);
      await BetService.placeBet(users[3], roundId, 5000); // Проигравший
      await BetService.placeBet(users[4], roundId, 15000); // Проигравший

      // Завершить раунд и создать следующий
      await RoundService.endRound(roundId.toString());
      const nextRound = await RoundService.createNextRound();
      const nextRoundId = nextRound!._id.toString();

      // Отладка: проверить все ставки перед обработкой
      const { Bet } = await import('../models/Bet.model');
      const allBets = await Bet.find({ roundId }).exec();
      console.log('All bets before processing:', allBets.map(b => ({ 
        userId: b.userId.toString(), 
        amount: b.amount,
        userIndex: users.findIndex(u => u.toString() === b.userId.toString())
      })));

      // Обработать победителей
      const winners = await RankingService.processRoundWinners(roundId.toString(), {
        winnersPerRound: 3,
        rewardAmount: 1000,
        nextRoundId,
      });

      // Отладка: проверить победителей
      console.log('Winners:', winners.map(w => ({ 
        userId: w.userId.toString(), 
        rank: w.rank,
        userIndex: users.findIndex(u => u.toString() === w.userId.toString())
      })));

      // Проверить, что проигравшие ставки перенесены
      const bet3Next = await Bet.findOne({
        userId: users[3],
        roundId: nextRound!._id,
      });
      const bet4Next = await Bet.findOne({
        userId: users[4],
        roundId: nextRound!._id,
      });

      // Отладка
      console.log('bet3Next:', bet3Next ? JSON.stringify(bet3Next.toObject()) : 'null');
      console.log('bet4Next:', bet4Next ? JSON.stringify(bet4Next.toObject()) : 'null');

      expect(bet3Next).toBeDefined();
      expect(bet3Next?.amount).toBe(5000);
      expect(bet4Next).toBeDefined();
      expect(bet4Next?.amount).toBe(15000);

      // Проверить, что победители не перенесли ставки
      const bet1Next = await Bet.findOne({
        userId: users[0],
        roundId: nextRound!._id,
      });
      expect(bet1Next).toBeNull(); // Победитель не должен перенести ставку
    });

    it('должен обработать случай с одинаковыми ставками', async () => {
      const users = await createTestUsers(3);
      const roundId = await getCurrentRoundId();
      // Разместить одинаковые ставки
      await BetService.placeBet(users[0], roundId, 10000);
      await BetService.placeBet(users[1], roundId, 10000);
      await BetService.placeBet(users[2], roundId, 10000);

      await RoundService.endRound(roundId.toString());

      const winners = await RankingService.processRoundWinners(roundId.toString(), {
        winnersPerRound: 3,
        rewardAmount: 1000,
      });

      // Все должны быть победителями
      expect(winners.length).toBe(3);
      const winnerUserIds = winners.map((w) => w.userId.toString());
      expect(winnerUserIds).toContain(users[0].toString());
      expect(winnerUserIds).toContain(users[1].toString());
      expect(winnerUserIds).toContain(users[2].toString());
    });

    it('не должен обработать победителей для несуществующего раунда', async () => {
      const fakeRoundId = new mongoose.Types.ObjectId().toString();

      await expect(
        RankingService.processRoundWinners(fakeRoundId, {
          winnersPerRound: 3,
          rewardAmount: 1000,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getCurrentTop100', () => {
    it('должен вернуть топ ставки', async () => {
      const users = await createTestUsers(3);
      const roundId = await getCurrentRoundId();
      await BetService.placeBet(users[0], roundId, 10000);
      await BetService.placeBet(users[1], roundId, 20000);
      await BetService.placeBet(users[2], roundId, 30000);

      const top100 = await RankingService.getCurrentTop100(roundId.toString(), 100);

      expect(top100.length).toBe(3);
      expect(top100[0].bet.amount).toBe(30000);
      expect(top100[1].bet.amount).toBe(20000);
      expect(top100[2].bet.amount).toBe(10000);
    });

    it('должен вернуть только топ-N', async () => {
      const users = await createTestUsers(3);
      const roundId = await getCurrentRoundId();
      await BetService.placeBet(users[0], roundId, 10000);
      await BetService.placeBet(users[1], roundId, 20000);
      await BetService.placeBet(users[2], roundId, 30000);

      const top2 = await RankingService.getCurrentTop100(roundId.toString(), 2);

      expect(top2.length).toBe(2);
      expect(top2[0].bet.amount).toBe(30000);
      expect(top2[1].bet.amount).toBe(20000);
    });
  });
});
