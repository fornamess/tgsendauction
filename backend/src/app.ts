import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { connectDatabase } from './config/database';
import { startScheduler } from './jobs/scheduler';
import { apiLimiter } from './middleware/rateLimitSimple';
import { logSuspiciousActivity, sanitizeInput, validatePayloadSize } from './middleware/security';
import { auctionRoutes } from './routes/auction.routes';
import { betRoutes } from './routes/bet.routes';
import { roundRoutes } from './routes/round.routes';
import { statsRoutes } from './routes/stats.routes';
import { userRoutes } from './routes/user.routes';
import { errorHandler } from './utils/errors';

// Загружаем переменные окружения
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Middleware безопасности
const corsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) {
    // Разрешаем запросы без origin (например, мобильные приложения, Postman)
    if (!origin) return callback(null, true);

    // Разрешаем Telegram домены
    if (
      origin.includes('telegram.org') ||
      origin.includes('t.me') ||
      origin.includes('web.telegram.org') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('amvera.tech') ||
      origin.includes('amvera.ru')
    ) {
      return callback(null, true);
    }

    // В production можно добавить проверку разрешенных доменов
    if (process.env.ALLOWED_ORIGINS) {
      const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
    }

    callback(null, true); // Разрешаем все для development
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(validatePayloadSize(10 * 1024)); // 10MB максимум
app.use(express.json({ limit: '10mb' })); // Ограничение размера тела запроса
app.use(sanitizeInput); // Защита от XSS
app.use(logSuspiciousActivity); // Логирование подозрительной активности

// Rate limiting для всех API запросов, кроме админских операций
app.use('/api', (req, res, next) => {
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
  // Для остальных запросов применяем rate limiting
  return apiLimiter(req, res, next);
});

// Логирование всех запросов (только в development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`, req.body || '');
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

// Обработчик ошибок (должен быть последним)
app.use(errorHandler);

// Инициализация
const startServer = async () => {
  try {
    await connectDatabase();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Сервер запущен на порту ${PORT}`);
      console.log(`📍 Доступен по адресу: http://0.0.0.0:${PORT}`);
      console.log(`✅ Health check: http://0.0.0.0:${PORT}/health`);
    });

    server.on('error', (error: any) => {
      console.error('❌ Ошибка сервера:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Порт ${PORT} уже занят`);
      }
      process.exit(1);
    });

    // Запуск планировщика раундов
    startScheduler();
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
};

startServer();

export default app;
