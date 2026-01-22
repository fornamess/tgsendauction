/**
 * Кастомные классы ошибок для лучшей обработки
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(`${resource} не найден${id ? ` (ID: ${id})` : ''}`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Необходима авторизация') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Доступ запрещен') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class InsufficientFundsError extends AppError {
  constructor(required: number, available: number) {
    super(
      `Недостаточно средств. Требуется: ${required}, доступно: ${available}`,
      400,
      'INSUFFICIENT_FUNDS',
      { required, available }
    );
  }
}

import type { NextFunction, Request, Response } from 'express';
import { logger } from './logger';

type MongoErrorLike = {
  name?: string;
  code?: number;
  keyPattern?: Record<string, unknown>;
  errors?: unknown;
};

/**
 * Middleware для обработки ошибок
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const error = err instanceof Error ? err : new Error(String(err));

  // Логирование ошибки
  logger.error('❌ Ошибка:', error, {
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
  });

  // Если это наша кастомная ошибка
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      details: error.details,
    });
  }

  // Ошибки валидации MongoDB
  const mongoError = err as MongoErrorLike;

  if (mongoError.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Ошибка валидации данных',
      details: mongoError.errors,
    });
  }

  // Ошибки дубликата (unique index)
  if (mongoError.code === 11000) {
    const field = Object.keys(mongoError.keyPattern || {})[0];
    return res.status(409).json({
      error: `Дубликат: ${field} уже существует`,
      code: 'DUPLICATE',
    });
  }

  // Ошибки кастинга ObjectId
  if (mongoError.name === 'CastError') {
    return res.status(400).json({
      error: 'Неверный формат ID',
      code: 'INVALID_ID',
    });
  }

  // Общая ошибка сервера
  return res.status(500).json({
    error:
      process.env.NODE_ENV === 'production'
        ? 'Внутренняя ошибка сервера'
        : error.message,
    code: 'INTERNAL_ERROR',
  });
}
