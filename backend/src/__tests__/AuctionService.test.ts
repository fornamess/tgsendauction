import mongoose from 'mongoose';
import { AuctionService } from '../services/AuctionService';
import { Auction, AuctionStatus } from '../models/Auction.model';
import { ConflictError, NotFoundError } from '../utils/errors';

describe('AuctionService', () => {
  describe('createAuction', () => {
    it('должен создать новый аукцион в статусе draft', async () => {
      const auction = await AuctionService.createAuction(
        'Тестовый аукцион',
        1000,
        100,
        30,
        60
      );

      expect(auction).toBeDefined();
      expect(auction.name).toBe('Тестовый аукцион');
      expect(auction.status).toBe(AuctionStatus.DRAFT);
      expect(auction.rewardAmount).toBe(1000);
      expect(auction.winnersPerRound).toBe(100);
      expect(auction.totalRounds).toBe(30);
      expect(auction.roundDurationMinutes).toBe(60);
    });

    it('должен использовать значения по умолчанию', async () => {
      const auction = await AuctionService.createAuction('Тест');

      expect(auction.rewardAmount).toBe(1000);
      expect(auction.winnersPerRound).toBe(100);
      expect(auction.totalRounds).toBe(30);
      expect(auction.roundDurationMinutes).toBe(60);
    });

    it('не должен создавать новый аукцион, если уже есть черновик', async () => {
      await AuctionService.createAuction('Первый аукцион');

      await expect(
        AuctionService.createAuction('Второй аукцион')
      ).rejects.toThrow(ConflictError);
    });

    it('не должен создавать новый аукцион, если уже есть активный', async () => {
      const draft = await AuctionService.createAuction('Черновик');
      await AuctionService.startAuction(draft._id.toString());

      await expect(
        AuctionService.createAuction('Новый аукцион')
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('startAuction', () => {
    it('должен запустить аукцион из статуса draft', async () => {
      const draft = await AuctionService.createAuction('Тестовый аукцион');
      const started = await AuctionService.startAuction(draft._id.toString());

      expect(started.status).toBe(AuctionStatus.ACTIVE);
    });

    it('не должен запустить несуществующий аукцион', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      await expect(
        AuctionService.startAuction(fakeId)
      ).rejects.toThrow(NotFoundError);
    });

    it('не должен запустить уже запущенный аукцион', async () => {
      const draft = await AuctionService.createAuction('Тест');
      await AuctionService.startAuction(draft._id.toString());

      await expect(
        AuctionService.startAuction(draft._id.toString())
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('endAuction', () => {
    it('должен завершить активный аукцион', async () => {
      const draft = await AuctionService.createAuction('Тест');
      const started = await AuctionService.startAuction(draft._id.toString());
      const ended = await AuctionService.endAuction(started._id.toString());

      expect(ended.status).toBe(AuctionStatus.ENDED);
      expect(ended.endedAt).toBeDefined();
    });

    it('не должен завершить несуществующий аукцион', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();

      await expect(
        AuctionService.endAuction(fakeId)
      ).rejects.toThrow(NotFoundError);
    });

    it('не должен завершить уже завершенный аукцион', async () => {
      const draft = await AuctionService.createAuction('Тест');
      const started = await AuctionService.startAuction(draft._id.toString());
      await AuctionService.endAuction(started._id.toString());

      await expect(
        AuctionService.endAuction(started._id.toString())
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('getCurrentAuction', () => {
    it('должен вернуть активный аукцион', async () => {
      const draft = await AuctionService.createAuction('Тест');
      const started = await AuctionService.startAuction(draft._id.toString());

      const current = await AuctionService.getCurrentAuction();

      expect(current).toBeDefined();
      expect(current?._id.toString()).toBe(started._id.toString());
      expect(current?.status).toBe(AuctionStatus.ACTIVE);
    });

    it('должен вернуть null, если нет активного аукциона', async () => {
      // Убедимся, что нет активных аукционов
      const activeAuctions = await Auction.find({ status: AuctionStatus.ACTIVE });
      for (const auction of activeAuctions) {
        auction.status = AuctionStatus.ENDED;
        await auction.save();
      }
      
      // Очищаем кеш через прямое обращение к БД (кеш живет 5 секунд, но мы можем обойти его)
      // Просто проверим напрямую, что нет активных аукционов
      const directCheck = await Auction.findOne({ status: AuctionStatus.ACTIVE });
      expect(directCheck).toBeNull();
      
      // Подождем 6 секунд, чтобы кеш точно истек
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      const current = await AuctionService.getCurrentAuction();

      expect(current).toBeNull();
    });

    it('не должен возвращать завершенный аукцион', async () => {
      const draft = await AuctionService.createAuction('Тест');
      const started = await AuctionService.startAuction(draft._id.toString());
      await AuctionService.endAuction(started._id.toString());

      const current = await AuctionService.getCurrentAuction();

      expect(current).toBeNull();
    });
  });

  describe('updateAuction', () => {
    it('должен обновить настройки черновика', async () => {
      const draft = await AuctionService.createAuction('Тест');
      const updated = await AuctionService.updateAuction(draft._id.toString(), {
        name: 'Обновленное название',
        rewardAmount: 2000,
        winnersPerRound: 50,
      });

      expect(updated.name).toBe('Обновленное название');
      expect(updated.rewardAmount).toBe(2000);
      expect(updated.winnersPerRound).toBe(50);
    });

    it('не должен обновить активный аукцион', async () => {
      const draft = await AuctionService.createAuction('Тест');
      const started = await AuctionService.startAuction(draft._id.toString());

      await expect(
        AuctionService.updateAuction(started._id.toString(), {
          name: 'Новое название',
        })
      ).rejects.toThrow(ConflictError);
    });

    it('не должен обновить завершенный аукцион', async () => {
      const draft = await AuctionService.createAuction('Тест');
      const started = await AuctionService.startAuction(draft._id.toString());
      const ended = await AuctionService.endAuction(started._id.toString());

      await expect(
        AuctionService.updateAuction(ended._id.toString(), {
          name: 'Новое название',
        })
      ).rejects.toThrow(ConflictError);
    });
  });
});
