import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Защита от XSS и инъекций
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  if (req.body) {
    // Рекурсивная очистка строк от потенциально опасных символов
    const sanitize = (obj: unknown): unknown => {
      if (typeof obj === 'string') {
        // Удаляем потенциально опасные символы
        return obj.replace(/[<>]/g, '');
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }
      if (obj && typeof obj === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitize(value);
        }
        return sanitized;
      }
      return obj;
    };

    req.body = sanitize(req.body);
  }

  next();
}

/**
 * Защита от слишком больших payload
 */
export function validatePayloadSize(maxSize: number = 10 * 1024) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength > maxSize * 1024) {
      logger.warn('Слишком большой payload', {
        size: contentLength,
        maxSize: maxSize * 1024,
        ip: req.ip,
      });
      return res.status(413).json({ error: 'Payload слишком большой' });
    }
    next();
  };
}

/**
 * Логирование подозрительных запросов
 */
export function logSuspiciousActivity(req: Request, res: Response, next: NextFunction) {
  // Проверка на подозрительные паттерны
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /onerror=/i,
    /onload=/i,
    /eval\(/i,
    /exec\(/i,
  ];

  const checkString = (str: string): boolean => {
    return suspiciousPatterns.some(pattern => pattern.test(str));
  };

  const checkObject = (obj: unknown): boolean => {
    if (typeof obj === 'string') {
      return checkString(obj);
    }
    if (Array.isArray(obj)) {
      return obj.some(checkObject);
    }
    if (obj && typeof obj === 'object') {
      return Object.values(obj).some(checkObject);
    }
    return false;
  };

  if (req.body && checkObject(req.body)) {
    logger.warn('Подозрительная активность обнаружена', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      body: req.body,
    });
  }

  next();
}
