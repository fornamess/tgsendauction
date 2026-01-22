import mongoose from 'mongoose';
import { AuctionService } from '../services/AuctionService';
import { RoundService } from '../services/RoundService';
import { BetService } from '../services/BetService';
import { RankingService } from '../services/RankingService';
import { TransactionService } from '../services/TransactionService';
import { User } from '../models/User.model';
import { Transaction, TransactionType } from '../models/Transaction.model';
import { Winner } from '../models/Winner.model';

describe('Интеграционные тесты', () => {
  it('должен провести полный цикл аукциона: создание -> ставки -> победители -> возвраты', async () => {
    // 1. Создать аукцион
    const draft = await AuctionService.createAuction('Интеграционный тест', 1000, 2, 2, 60);
    const started = await AuctionService.startAuction(draft._id.toString());

    // 2. Создать пользователей
    const user1 = new User({
      username: `user1_${Date.now()}`,
      balance: 50000,
      robux: 0,
    });
    const user2 = new User({
      username: `user2_${Date.now()}`,
      balance: 50000,
      robux: 0,
    });
    const user3 = new User({
      username: `user3_${Date.now()}`,
      balance: 50000,
      robux: 0,
    });
    await user1.save();
    await user2.save();
    await user3.save();

    // 3. startAuction автоматически создает первый раунд
    const round1 = await RoundService.getCurrentRound();
    expect(round1).toBeDefined();
    expect(round1?.number).toBe(1);

    // 4. Разместить ставки в первом раунде
    await BetService.placeBet(user1._id, round1!._id, 20000); // Победитель
    await BetService.placeBet(user2._id, round1!._id, 25000); // Победитель
    await BetService.placeBet(user3._id, round1!._id, 10000); // Проигравший

    // Проверить балансы после ставок
    const u1AfterBets = await User.findById(user1._id);
    const u2AfterBets = await User.findById(user2._id);
    const u3AfterBets = await User.findById(user3._id);
    expect(u1AfterBets?.balance).toBe(30000);
    expect(u2AfterBets?.balance).toBe(25000);
    expect(u3AfterBets?.balance).toBe(40000);

    // 5. Завершить первый раунд и обработать победителей
    await RoundService.endRound(round1!._id.toString());
    const round2 = await RoundService.createNextRound();
    const winners1 = await RankingService.processRoundWinners(round1!._id.toString(), {
      winnersPerRound: 2,
      rewardAmount: 1000,
      nextRoundId: round2!._id.toString(),
    });

    expect(winners1.length).toBe(2);
    expect(winners1.map((w) => w.userId.toString()).sort()).toEqual(
      [user2._id.toString(), user1._id.toString()].sort()
    );

    // Проверить начисление призов
    const u1AfterRound1 = await User.findById(user1._id);
    const u2AfterRound1 = await User.findById(user2._id);
    expect(u1AfterRound1?.robux).toBe(1000);
    expect(u2AfterRound1?.robux).toBe(1000);

    // Проверить перенос проигравшей ставки
    const { Bet } = await import('../models/Bet.model');
    const bet3InRound2 = await Bet.findOne({
      userId: user3._id,
      roundId: round2!._id,
    });
    expect(bet3InRound2).toBeDefined();
    expect(bet3InRound2?.amount).toBe(10000);

    // 6. Второй раунд - ставки
    await BetService.placeBet(user1._id, round2!._id, 15000);
    await BetService.placeBet(user2._id, round2!._id, 20000);

    // 7. Завершить второй раунд (последний)
    await RoundService.endRound(round2!._id.toString());
    const winners2 = await RankingService.processRoundWinners(round2!._id.toString(), {
      winnersPerRound: 2,
      rewardAmount: 1000,
      nextRoundId: null,
    });

    expect(winners2.length).toBe(2);

    // 8. Завершить аукцион и обработать возвраты
    await AuctionService.endAuction(started._id.toString());
    const { processRefundsJob } = await import('../application/roundJobs');
    await processRefundsJob(started._id.toString());

    // Проверить, что проигравший получил возврат
    const u3Final = await User.findById(user3._id);
    const refundTransactions = await Transaction.find({
      userId: user3._id,
      type: TransactionType.REFUND,
    });

    expect(refundTransactions.length).toBeGreaterThan(0);
    // user3 сделал ставку 10000 в round1 и она была перенесена в round2
    // Но он также мог получить возврат, если не выиграл во втором раунде
  });

  it('должен корректно обработать повышение ставок', async () => {
    const draft = await AuctionService.createAuction('Тест повышения ставок', 1000, 100, 1, 60);
    const started = await AuctionService.startAuction(draft._id.toString());
    // startAuction автоматически создает первый раунд
    const round = await RoundService.getCurrentRound();
    if (!round) {
      throw new Error('Раунд должен быть создан автоматически при запуске аукциона');
    }

    const user = new User({
      username: `user_${Date.now()}`,
      balance: 50000,
      robux: 0,
    });
    await user.save();

    const roundId = round._id;
    // Первая ставка
    await BetService.placeBet(user._id, roundId, 10000);
    let userAfterFirst = await User.findById(user._id);
    expect(userAfterFirst?.balance).toBe(40000);

    // Повышение ставки
    await BetService.placeBet(user._id, roundId, 25000);
    let userAfterSecond = await User.findById(user._id);
    expect(userAfterSecond?.balance).toBe(25000); // 50000 - 25000

    // Проверить финальную ставку
    const { Bet } = await import('../models/Bet.model');
    const finalBet = await Bet.findOne({ userId: user._id, roundId });
    expect(finalBet?.amount).toBe(25000);
  });
});
