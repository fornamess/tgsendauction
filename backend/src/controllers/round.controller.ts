import { Response } from 'express';
import { Auction, AuctionStatus, IAuction } from '../models/Auction.model';
import { AuctionService } from '../services/AuctionService';
import { RankingService } from '../services/RankingService';
import { RoundService } from '../services/RoundService';
import { AuthRequest } from '../utils/auth';
import { ConflictError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

export class RoundController {
  /**
   * Получить текущий активный раунд с топ-100
   */
  static async getCurrent(req: AuthRequest, res: Response) {
    try {
      // Таймаут для всего запроса - 15 секунд
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 15000)
      );

      const result = await Promise.race([
        (async () => {
          const round = await RoundService.getCurrentRound();
          if (!round) {
            return null;
          }

          const auction = round.auctionId as unknown as IAuction;
          const winnersPerRound = auction?.winnersPerRound || 100;

          // Параллельные запросы для оптимизации
          const promises: [Promise<any>, Promise<any> | null, Promise<any> | null] = [
            RankingService.getCurrentTop100(round._id.toString(), winnersPerRound),
            null,
            null
          ];

          // Получить ставку текущего пользователя, если авторизован
          if (req.userId) {
            const { BetService } = await import('../services/BetService');
            promises[1] = BetService.getUserBet(req.userId, round._id);
            promises[2] = RankingService.getUserRank(req.userId, round._id.toString());
          }

          const [top100, userBet, userRank] = await Promise.all(promises);

          return {
            round,
            top100,
            userBet,
            userRank,
            winnersPerRound,
          };
        })(),
        timeoutPromise
      ]);

      if (!result) {
        return res.status(404).json({ error: 'Активный раунд не найден' });
      }

      res.json(result);
    } catch (error: unknown) {
      logger.error('Ошибка получения текущего раунда', error);
      // Graceful degradation
      return res.status(200).json({
        round: null,
        top100: [],
        userBet: null,
        userRank: null,
        winnersPerRound: 100,
      });
    }
  }

  /**
   * Получить раунд по ID
   */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const { roundId } = req.params;
      const round = await RoundService.getRoundById(roundId);
      if (!round) {
        throw new NotFoundError('Раунд', roundId);
      }

      const auction = round.auctionId as unknown as IAuction;
      const winnersPerRound = auction?.winnersPerRound || 100;
      const top100 = await RankingService.getCurrentTop100(roundId, winnersPerRound);

      res.json({
        round,
        top100,
        winnersPerRound,
      });
    } catch (error: unknown) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Ошибка получения раунда';
      return res.status(500).json({ error: message });
    }
  }

  /**
   * Завершить текущий раунд преждевременно (для демонстрации)
   */
  static async endCurrent(req: AuthRequest, res: Response) {
    try {
      const round = await RoundService.getCurrentRound();
      if (!round) {
        throw new NotFoundError('Активный раунд', '');
      }

      const auction = await Auction.findById(round.auctionId);
      if (!auction || auction.status !== AuctionStatus.ACTIVE) {
        throw new ConflictError('Аукцион не активен');
      }

      logger.info(`Ручное завершение раунда ${round.number}`, {
        roundId: round._id.toString(),
        auctionId: auction._id.toString(),
      });

      await RoundService.endRound(round._id.toString());

      const totalRounds = auction.totalRounds ?? 30;
      const isLastRound = round.number >= totalRounds;
      let nextRoundId: string | null = null;

      if (!isLastRound) {
        const nextRound = await RoundService.createNextRound(auction, round.number);
        if (nextRound) {
          nextRoundId = nextRound._id.toString();
          logger.info(`Создан новый раунд`, {
            roundNumber: nextRound.number,
            roundId: nextRoundId,
          });
        }
      }

      logger.info(`Обработка победителей раунда ${round.number}`);
      const winners = await RankingService.processRoundWinners(round._id.toString(), {
        winnersPerRound: auction.winnersPerRound ?? 100,
        rewardAmount: auction.rewardAmount ?? 1000,
        nextRoundId,
      });
      logger.info(`Найдено победителей в раунде ${round.number}`, { count: winners.length });

      if (isLastRound) {
        logger.info(`Аукцион завершен по лимиту раундов`, {
          auctionId: auction._id.toString(),
        });
        await AuctionService.endAuction(auction._id.toString());
        const { processRefundsJob } = await import('../application/roundJobs');
        await processRefundsJob(auction._id.toString());
      }

      res.json({
        message: `Раунд ${round.number} завершен`,
        winnersCount: winners.length,
        isLastRound,
        nextRoundId,
      });
    } catch (error: unknown) {
      if (error instanceof NotFoundError || error instanceof ConflictError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Ошибка завершения раунда';
      logger.error('Ошибка завершения раунда', error);
      return res.status(500).json({ error: message });
    }
  }

  /**
   * Создать следующий раунд вручную (если нет активного)
   */
  static async createNext(req: AuthRequest, res: Response) {
    try {
      const auction = await Auction.findOne({ status: AuctionStatus.ACTIVE });
      if (!auction) {
        throw new NotFoundError('Активный аукцион', '');
      }

      const activeRound = await RoundService.getCurrentRound();
      if (activeRound) {
        throw new ConflictError('Уже есть активный раунд. Сначала завершите текущий.');
      }

      const lastRound = await RoundService.getRoundsByAuction(auction._id.toString());
      const lastRoundNumber = lastRound.length > 0 ? lastRound[lastRound.length - 1].number : 0;
      const totalRounds = auction.totalRounds ?? 30;

      if (lastRoundNumber >= totalRounds) {
        throw new ConflictError('Достигнут лимит раундов для этого аукциона');
      }

      const nextRound = await RoundService.createNextRound(auction, lastRoundNumber);
      if (!nextRound) {
        throw new ConflictError('Не удалось создать раунд');
      }

      logger.info(`Ручное создание раунда ${nextRound.number}`, {
        roundId: nextRound._id.toString(),
        auctionId: auction._id.toString(),
      });

      res.json({
        message: `Раунд ${nextRound.number} создан`,
        round: nextRound,
      });
    } catch (error: unknown) {
      if (error instanceof NotFoundError || error instanceof ConflictError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Ошибка создания раунда';
      logger.error('Ошибка создания раунда', error);
      return res.status(500).json({ error: message });
    }
  }
}
