import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

/**
 * Опасные паттерны для sanitization
 */
const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // script tags
  /javascript:/gi, // javascript: protocol
  /data:/gi, // data: protocol  
  /vbscript:/gi, // vbscript: protocol
  /on\w+\s*=/gi, // event handlers (onclick, onerror, etc.)
  /expression\s*\(/gi, // CSS expression()
  /url\s*\(/gi, // CSS url()
];

/**
 * Экранирование HTML-сущностей
 */
function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };
  return str.replace(/[&<>"'`=/]/g, char => htmlEntities[char] || char);
}

/**
 * Удаление опасных паттернов
 */
function removeDangerousPatterns(str: string): string {
  let result = str;
  for (const pattern of DANGEROUS_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result;
}

/**
 * Защита от XSS и инъекций
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  if (req.body) {
    // Рекурсивная очистка строк от потенциально опасных символов
    const sanitize = (obj: unknown): unknown => {
      if (typeof obj === 'string') {
        // Удаляем опасные паттерны и экранируем HTML
        let sanitized = removeDangerousPatterns(obj);
        sanitized = escapeHtml(sanitized);
        return sanitized;
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }
      if (obj && typeof obj === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          // Санитизируем также ключи
          const sanitizedKey = typeof key === 'string' ? escapeHtml(key) : key;
          sanitized[sanitizedKey] = sanitize(value);
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
