import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Rate limiting для защиты от злоупотреблений
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  message: 'Слишком много запросов, попробуйте позже',
  standardHeaders: true,
  legacyHeaders: false,
});

export const betLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 10, // максимум 10 ставок в минуту
  message: 'Слишком много ставок, подождите немного',
  standardHeaders: true,
  legacyHeaders: false,
});

export const depositLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 5, // максимум 5 пополнений в минуту
  message: 'Слишком много пополнений, подождите немного',
  standardHeaders: true,
  legacyHeaders: false,
});
