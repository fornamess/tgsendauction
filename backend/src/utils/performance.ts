import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

interface PerformanceMetrics {
  requestCount: number;
  totalResponseTime: number;
  slowRequests: number;
  errorCount: number;
  averageResponseTime: number;
}

let metrics: PerformanceMetrics = {
  requestCount: 0,
  totalResponseTime: 0,
  slowRequests: 0,
  errorCount: 0,
  averageResponseTime: 0,
};

const SLOW_REQUEST_THRESHOLD_MS = 100; // Порог для медленных запросов

/**
 * Middleware для мониторинга производительности запросов
 */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Перехватываем окончание ответа
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const path = req.path;
    const method = req.method;

    // Обновляем метрики
    metrics.requestCount++;
    metrics.totalResponseTime += duration;
    metrics.averageResponseTime = metrics.totalResponseTime / metrics.requestCount;

    // Логируем медленные запросы
    if (duration > SLOW_REQUEST_THRESHOLD_MS) {
      metrics.slowRequests++;
      logger.warn('Медленный запрос', {
        method,
        path,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        ip: req.ip,
      });
    }

    // Логируем ошибки
    if (res.statusCode >= 400) {
      metrics.errorCount++;
      logger.warn('Ошибка запроса', {
        method,
        path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
      });
    }
  });

  next();
}

/**
 * Получить текущие метрики производительности
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  return { ...metrics };
}

/**
 * Сбросить метрики
 */
export function resetPerformanceMetrics(): void {
  metrics = {
    requestCount: 0,
    totalResponseTime: 0,
    slowRequests: 0,
    errorCount: 0,
    averageResponseTime: 0,
  };
}

/**
 * Получить метрики использования памяти
 */
export function getMemoryMetrics() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
    rss: Math.round(usage.rss / 1024 / 1024), // MB
  };
}
