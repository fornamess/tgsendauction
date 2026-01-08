import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { connectDatabase } from './config/database';
import { auctionRoutes } from './routes/auction.routes';
import { roundRoutes } from './routes/round.routes';
import { betRoutes } from './routes/bet.routes';
import { userRoutes } from './routes/user.routes';
import { statsRoutes } from './routes/stats.routes';
import { startScheduler } from './jobs/scheduler';
import { errorHandler } from './utils/errors';
import { apiLimiter } from './middleware/rateLimitSimple';
import { sanitizeInput, validatePayloadSize, logSuspiciousActivity } from './middleware/security';

// Загружаем переменные окружения
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware безопасности
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Разрешаем запросы без origin (например, мобильные приложения, Postman)
    if (!origin) return callback(null, true);

    // Разрешаем Telegram домены
    if (
      origin.includes('telegram.org') ||
      origin.includes('t.me') ||
      origin.includes('web.telegram.org') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
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

// Rate limiting для всех API запросов
app.use('/api', apiLimiter);

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

    app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на порту ${PORT}`);
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
