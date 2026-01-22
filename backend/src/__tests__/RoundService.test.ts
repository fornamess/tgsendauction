import mongoose from 'mongoose';
import { RoundStatus } from '../models/Round.model';
import { AuctionService } from '../services/AuctionService';
import { RoundService } from '../services/RoundService';
import { ConflictError, NotFoundError } from '../utils/errors';

describe('RoundService', () => {
  describe('createNextRound', () => {
    it('должен создать первый раунд для активного аукциона', async () => {
      const draft = await AuctionService.createAuction('Тест', 1000, 100, 30, 60);
      const started = await AuctionService.startAuction(draft._id.toString());

      // startAuction автоматически создает первый раунд
      const round = await RoundService.getCurrentRound();

      expect(round).toBeDefined();
      expect(round?.number).toBe(1);
      expect(round?.status).toBe(RoundStatus.ACTIVE);
      // auctionId может быть объектом из-за populate или строкой
      const auctionIdStr = typeof round?.auctionId === 'object' && round.auctionId?._id
        ? round.auctionId._id.toString()
        : round?.auctionId?.toString() || '';
      expect(auctionIdStr).toBe(started._id.toString());
    });

    it('не должен создавать раунд, если уже есть активный', async () => {
      const draft = await AuctionService.createAuction('Тест');
      await AuctionService.startAuction(draft._id.toString());
      // startAuction автоматически создает первый раунд

      // Попытка создать второй раунд должна вернуть null, т.к. уже есть активный
      const secondRound = await RoundService.createNextRound();

      expect(secondRound).toBeNull();
    });

    it('не должен создавать раунд, если нет активного аукциона', async () => {
      const round = await RoundService.createNextRound();

      expect(round).toBeNull();
    });

    it('должен создать следующий раунд после завершения предыдущего', async () => {
      const draft = await AuctionService.createAuction('Тест', 1000, 100, 30, 60);
      await AuctionService.startAuction(draft._id.toString());
      // startAuction автоматически создает первый раунд
      const round1 = await RoundService.getCurrentRound();

      expect(round1).toBeDefined();
      expect(round1?.number).toBe(1);

      // Сохраняем ID перед завершением
      const round1Id = round1!._id.toString();
      await RoundService.endRound(round1Id);

      const round2 = await RoundService.createNextRound();

      expect(round2).toBeDefined();
      expect(round2?.number).toBe(2);
    });

    it('не должен создавать раунд, если достигнут лимит', async () => {
      const draft = await AuctionService.createAuction('Тест', 1000, 100, 2, 60);
      await AuctionService.startAuction(draft._id.toString());

      // startAuction автоматически создает первый раунд
      const round1 = await RoundService.getCurrentRound();
      expect(round1?.number).toBe(1);

      const round1Id = round1!._id.toString();
      await RoundService.endRound(round1Id);
      const round2 = await RoundService.createNextRound();
      expect(round2?.number).toBe(2);

      const round2Id = round2!._id.toString();
      await RoundService.endRound(round2Id);
      const round3 = await RoundService.createNextRound();

      expect(round3).toBeNull();
    });
  });

  describe('endRound', () => {
    it('должен завершить активный раунд', async () => {
      const draft = await AuctionService.createAuction('Тест');
      await AuctionService.startAuction(draft._id.toString());
      // startAuction автоматически создает первый раунд
      const round = await RoundService.getCurrentRound();

      expect(round).toBeDefined();
      // Сохраняем ID перед вызовом
      const roundId = round!._id.toString();
      const ended = await RoundService.endRound(roundId);

      expect(ended.status).toBe(RoundStatus.ENDED);
    });

    it('не должен завершить несуществующий раунд', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      await expect(
        RoundService.endRound(fakeId)
      ).rejects.toThrow(NotFoundError);
    });

    it('должен вернуть раунд, если он уже завершен', async () => {
      const draft = await AuctionService.createAuction('Тест');
      await AuctionService.startAuction(draft._id.toString());
      // startAuction автоматически создает первый раунд
      const round = await RoundService.getCurrentRound();
      expect(round).toBeDefined();
      // Сохраняем ID
      const roundId = round!._id.toString();
      await RoundService.endRound(roundId);

      const endedAgain = await RoundService.endRound(roundId);

      expect(endedAgain.status).toBe(RoundStatus.ENDED);
    });
  });

  describe('getCurrentRound', () => {
    it('должен вернуть активный раунд', async () => {
      const draft = await AuctionService.createAuction('Тест');
      await AuctionService.startAuction(draft._id.toString());
      // startAuction автоматически создает первый раунд

      const current = await RoundService.getCurrentRound();

      expect(current).toBeDefined();
      expect(current?.number).toBe(1);
      expect(current?.status).toBe(RoundStatus.ACTIVE);
    });

    it('должен вернуть null, если нет активного раунда', async () => {
      // Убедимся, что нет активных раундов
      const { Round } = await import('../models/Round.model');
      await Round.updateMany({ status: RoundStatus.ACTIVE }, { status: RoundStatus.ENDED });
      
      // Очищаем кеш, чтобы получить актуальные данные
      const { roundCache } = await import('../utils/redisCache');
      await roundCache.clear();

      const current = await RoundService.getCurrentRound();

      expect(current).toBeNull();
    });

    it('должен вернуть null для завершенного раунда', async () => {
      const draft = await AuctionService.createAuction('Тест');
      await AuctionService.startAuction(draft._id.toString());
      // startAuction автоматически создает первый раунд
      const round = await RoundService.getCurrentRound();
      expect(round).toBeDefined();
      // Сохраняем ID
      const roundId = round!._id.toString();
      await RoundService.endRound(roundId);
      
      // Очищаем кеш после завершения раунда
      const { roundCache } = await import('../utils/redisCache');
      await roundCache.clear();

      const current = await RoundService.getCurrentRound();

      expect(current).toBeNull();
    });
  });

  describe('extendRoundTime', () => {
    it('должен продлить время раунда', async () => {
      const draft = await AuctionService.createAuction('Тест');
      await AuctionService.startAuction(draft._id.toString());
      // startAuction автоматически создает первый раунд
      const round = await RoundService.getCurrentRound();
      expect(round).toBeDefined();

      // Сохраняем ID и время
      const roundId = round!._id.toString();
      const originalEndTime = round!.endTime.getTime();
      const extensionMs = 5 * 60 * 1000; // 5 минут

      const extended = await RoundService.extendRoundTime(
        roundId,
        extensionMs
      );

      expect(extended.endTime.getTime()).toBeGreaterThan(originalEndTime);
    });

    it('не должен продлить неактивный раунд', async () => {
      const draft = await AuctionService.createAuction('Тест');
      await AuctionService.startAuction(draft._id.toString());
      // startAuction автоматически создает первый раунд
      const round = await RoundService.getCurrentRound();
      expect(round).toBeDefined();
      // Сохраняем ID
      const roundId = round!._id.toString();
      await RoundService.endRound(roundId);

      await expect(
        RoundService.extendRoundTime(roundId, 60000)
      ).rejects.toThrow(ConflictError);
    });
  });
});
