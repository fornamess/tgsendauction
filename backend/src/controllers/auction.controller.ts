import { Response } from 'express';
import { AuctionService } from '../services/AuctionService';
import { AuthRequest } from '../utils/auth';

export class AuctionController {
  /**
   * Получить текущий активный аукцион
   */
  static async getCurrent(req: AuthRequest, res: Response) {
    try {
      const auction = await AuctionService.getCurrentAuction();
      if (!auction) {
        // Не логируем 404 как ошибку - это нормальная ситуация
        return res.status(404).json({ error: 'Активный аукцион не найден' });
      }
      res.json(auction);
    } catch (error: any) {
      console.error('❌ Ошибка получения аукциона:', error);
      res.status(500).json({ error: error.message || 'Ошибка получения аукциона' });
    }
  }

  /**
   * Создать новый аукцион (админ)
   */
  static async create(req: AuthRequest, res: Response) {
    try {
      console.log('📝 Запрос на создание аукциона:', req.body);
      const { name, prizeRobux } = req.body;

      if (!name) {
        console.log('❌ Ошибка: не указано название аукциона');
        return res.status(400).json({ error: 'Не указано название аукциона' });
      }

      console.log(`✅ Создание аукциона: "${name}", приз: ${prizeRobux || 1000} робуксов`);
      const auction = await AuctionService.createAuction(name, prizeRobux || 1000);
      console.log(`✅ Аукцион создан успешно:`, { id: auction._id, name: auction.name, status: auction.status });
      res.status(201).json(auction);
    } catch (error: any) {
      console.error('❌ Ошибка создания аукциона:', error);
      res.status(500).json({ error: error.message || 'Ошибка создания аукциона' });
    }
  }

  /**
   * Запустить аукцион (админ)
   */
  static async start(req: AuthRequest, res: Response) {
    try {
      const { auctionId } = req.params;
      const auction = await AuctionService.startAuction(auctionId);
      res.json(auction);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Ошибка запуска аукциона' });
    }
  }

  /**
   * Завершить аукцион (админ)
   */
  static async end(req: AuthRequest, res: Response) {
    try {
      const { auctionId } = req.params;
      const auction = await AuctionService.endAuction(auctionId);

      // Обработать возвраты
      const { processRefunds } = await import('../jobs/scheduler');
      await processRefunds(auctionId);

      res.json(auction);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Ошибка завершения аукциона' });
    }
  }

  /**
   * Получить аукцион по ID
   */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const { auctionId } = req.params;
      const auction = await AuctionService.getAuctionById(auctionId);
      if (!auction) {
        return res.status(404).json({ error: 'Аукцион не найден' });
      }
      res.json(auction);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Ошибка получения аукциона' });
    }
  }

  /**
   * Получить все аукционы (для админки)
   */
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const auctions = await AuctionService.getAllAuctions();
      res.json(auctions);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Ошибка получения аукционов' });
    }
  }
}
