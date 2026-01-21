import { Response } from 'express';
import { AuctionService } from '../services/AuctionService';
import { AuthRequest } from '../utils/auth';
import { ConflictError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { createAuctionSchema, updateAuctionSchema } from '../utils/validation';

export class AuctionController {
  /**
   * Получить текущий активный аукцион
   */
  static async getCurrent(req: AuthRequest, res: Response) {
    try {
      const auction = await AuctionService.getCurrentAuction();
      // Возвращаем 200 с null, если аукцион не найден (это нормальная ситуация)
      // Фронтенд обработает это и покажет соответствующее сообщение
      return res.status(200).json(auction);
    } catch (error: unknown) {
      logger.error('Ошибка получения текущего аукциона', error);
      return res.status(500).json({ error: 'Ошибка получения аукциона' });
    }
  }

  /**
   * Создать новый аукцион (админ)
   */
  static async create(req: AuthRequest, res: Response) {
    try {
      const { name, rewardAmount, winnersPerRound, totalRounds, roundDurationMinutes } =
        createAuctionSchema.parse(req.body);

      const auction = await AuctionService.createAuction(
        name,
        rewardAmount,
        winnersPerRound,
        totalRounds,
        roundDurationMinutes
      );
      res.status(201).json(auction);
    } catch (error: unknown) {
      if (error instanceof Error && error.message?.includes('активный аукцион')) {
        throw new ConflictError(error.message);
      }
      throw error;
    }
  }

  /**
   * Запустить аукцион (админ)
   */
  static async start(req: AuthRequest, res: Response) {
    const { auctionId } = req.params;
    if (!auctionId) {
      throw new NotFoundError('auctionId');
    }

    const auction = await AuctionService.startAuction(auctionId);
    res.json(auction);
  }

  /**
   * Завершить аукцион (админ)
   */
  static async end(req: AuthRequest, res: Response) {
    try {
      const { auctionId } = req.params;
      const auction = await AuctionService.endAuction(auctionId);

      // Обработать возвраты
      const { processRefundsJob } = await import('../application/roundJobs');
      await processRefundsJob(auctionId);

      res.json(auction);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Ошибка завершения аукциона';
      res.status(500).json({ error: message });
    }
  }

  /**
   * Получить аукцион по ID
   */
  static async getById(req: AuthRequest, res: Response) {
    const { auctionId } = req.params;
    const auction = await AuctionService.getAuctionById(auctionId);
    if (!auction) {
      throw new NotFoundError('Аукцион', auctionId);
    }
    res.json(auction);
  }

  /**
   * Получить все аукционы (для админки)
   */
  static async getAll(req: AuthRequest, res: Response) {
    const auctions = await AuctionService.getAllAuctions();
    res.json(auctions);
  }

  /**
   * Обновить настройки аукциона (админ)
   */
  static async update(req: AuthRequest, res: Response) {
    const { auctionId } = req.params;
    const updates = updateAuctionSchema.parse(req.body);
    const auction = await AuctionService.updateAuction(auctionId, updates);
    res.json(auction);
  }
}
