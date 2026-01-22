import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import type { Server } from 'http';
import path from 'path';
import { connectDatabase } from './config/database';
import { connectMongoDB } from './config/mongodb';
import { connectRedis } from './config/redis';
import { startScheduler } from './jobs/scheduler';
import { apiLimiterRedis } from './middleware/rateLimitRedis';
import { logSuspiciousActivity, sanitizeInput, validatePayloadSize } from './middleware/security';
import { initializeMongoIndexes } from './models/mongodb';
import { auctionRoutes } from './routes/auction.routes';
import { betRoutes } from './routes/bet.routes';
import { roundRoutes } from './routes/round.routes';
import { statsRoutes } from './routes/stats.routes';
import { userRoutes } from './routes/user.routes';
import { errorHandler } from './utils/errors';
import { logger } from './utils/logger';
import { getMetricsSnapshot } from './utils/metrics';
import { getMemoryMetrics, getPerformanceMetrics, performanceMiddleware } from './utils/performance';

// Загружаем переменные окружения
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Compression middleware (должен быть одним из первых)
app.use(compression());

// Helmet для базовых заголовков безопасности
app.use(
  helmet({
    contentSecurityPolicy: false, // Отключаем CSP здесь, настраиваем в nginx
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Middleware безопасности - CORS с whitelist
const getAllowedOrigins = (): string[] => {
  const origins: string[] = [];

  // Telegram домены
  origins.push(
    'https://web.telegram.org',
    'https://telegram.org',
    'https://t.me'
  );

  // Amvera домены
  origins.push(
    'https://ygth-romansf.waw0.amvera.tech',
    'https://amvera.tech',
    'https://amvera.ru'
  );

  // Development
  if (process.env.NODE_ENV !== 'production') {
    origins.push(
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    );
  }

  // Дополнительные origins из переменных окружения
  if (process.env.ALLOWED_ORIGINS) {
    const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
    origins.push(...envOrigins);
  }

  return [...new Set(origins)]; // Убираем дубликаты
};

const corsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) {
    const allowedOrigins = getAllowedOrigins();

    // Разрешаем запросы без origin только в development (мобильные приложения, Postman)
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        return callback(new Error('CORS: Origin не указан'), false);
      }
      return callback(null, true);
    }

    // Проверяем точное совпадение (без includes для безопасности)
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // В development логируем, но разрешаем
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('CORS: Разрешен origin не из whitelist (development mode)', { origin });
      return callback(null, true);
    }

    // В production отклоняем
    logger.warn('CORS: Запрос отклонен - origin не в whitelist', { origin, allowedOrigins });
    callback(new Error('CORS: Origin не разрешен'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Telegram-Init-Data', 'X-CSRF-Token', 'X-Bypass-RateLimit'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400, // 24 часа для preflight
};

app.use(cors(corsOptions));
app.use(validatePayloadSize(10 * 1024)); // 10MB максимум
app.use(express.json({ limit: '10mb' })); // Ограничение размера тела запроса
app.use(sanitizeInput); // Защита от XSS
app.use(logSuspiciousActivity); // Логирование подозрительной активности

// Rate limiting для всех API запросов, кроме админских операций и load test
app.use('/api', (req, res, next) => {
  // Автоматический обход rate limiting для load test пользователей
  const userId = (req.headers['x-user-id'] as string) || '';
  if (userId.startsWith('load_test_')) {
    return next(); // Пропускаем без rate limiting для load test
  }

  // Можно обойти rate limiting для тестов через заголовок X-Bypass-RateLimit
  // Express приводит заголовки к нижнему регистру, но проверим оба варианта для надежности
  const bypassHeader = req.headers['x-bypass-ratelimit'] || req.headers['X-Bypass-RateLimit'];
  if (bypassHeader === 'true') {
    return next(); // Пропускаем без rate limiting для тестов
  }

  // Исключаем админские операции из rate limiting
  // Админские операции на /api/auction:
  // - POST /api/auction - создание аукциона
  // - PATCH /api/auction/:id - обновление аукциона
  // - POST /api/auction/:id/start - запуск аукциона
  // - POST /api/auction/:id/end - завершение аукциона
  if (req.path.startsWith('/auction')) {
    // POST на корень - создание
    if (req.method === 'POST' && req.path === '/auction') {
      return next(); // Пропускаем без rate limiting
    }
    // PATCH на /auction/:id - обновление
    if (req.method === 'PATCH' && /^\/auction\/[^/]+$/.test(req.path)) {
      return next(); // Пропускаем без rate limiting
    }
    // POST на /auction/:id/start или /auction/:id/end - запуск/завершение
    if (req.method === 'POST' && (req.path.includes('/start') || req.path.includes('/end'))) {
      return next(); // Пропускаем без rate limiting
    }
  }
  // Для остальных запросов применяем Redis-based rate limiting (10000 в 15 минут)
  return apiLimiterRedis(req, res, next);
});

// Мониторинг производительности (для всех окружений)
app.use(performanceMiddleware);

// Логирование всех запросов (только в development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    logger.debug('HTTP request', {
      method: req.method,
      path: req.path,
      body: req.body || '',
    });
    next();
  });
}

// Routes
app.use('/api/auction', auctionRoutes);
app.use('/api/round', roundRoutes);
app.use('/api/bet', betRoutes);
app.use('/api/user', userRoutes);
app.use('/api/stats', statsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// Метрики для мониторинга
app.get('/metrics', (req, res) => {
  const performanceMetrics = getPerformanceMetrics();
  const memoryMetrics = getMemoryMetrics();
  const appMetrics = getMetricsSnapshot();

  res.json({
    ...appMetrics,
    performance: performanceMetrics,
    memory: memoryMetrics,
    uptime: process.uptime(),
  });
});

// Обработчик ошибок (должен быть последним)
app.use(errorHandler);

// Инициализация
const startServer = async () => {
  try {
    // Подключаем MongoDB (Mongoose для обратной совместимости)
    await connectDatabase();

    // Подключаем MongoDB native driver (для новых сервисов)
    try {
      await connectMongoDB();
      await initializeMongoIndexes();
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      logger.error('⚠️ MongoDB native driver недоступен, используем только Mongoose', errorObj);
    }

    // Подключаем Redis (graceful degradation - продолжаем без Redis если недоступен)
    try {
      const redisClient = await connectRedis();
      if (!redisClient) {
        logger.warn('⚠️ Redis недоступен, работаем без кеширования и распределенного rate limiting');
      }
    } catch (error) {
      logger.error('⚠️ Ошибка подключения к Redis, работаем без кеширования', error instanceof Error ? error : new Error(String(error)));
    }

    const server: Server = app.listen(PORT, '0.0.0.0', () => {
      logger.info('🚀 Сервер запущен', {
        port: PORT,
        host: '0.0.0.0',
        healthCheck: `http://0.0.0.0:${PORT}/health`,
      });
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      logger.error('❌ Ошибка сервера', error, { port: PORT });
      if (error.code === 'EADDRINUSE') {
        logger.error('Порт уже занят', undefined, { port: PORT });
      }
      process.exit(1);
    });

    // Запуск планировщика раундов
    startScheduler();
  } catch (error) {
    logger.error('❌ Ошибка запуска сервера', error);
    process.exit(1);
  }
};

startServer();

export default app;
