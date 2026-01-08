/**
 * Кастомные классы ошибок для лучшей обработки
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
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
  constructor(message: string, details?: any) {
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

/**
 * Middleware для обработки ошибок
 */
export function errorHandler(err: any, req: any, res: any, next: any) {
  // Логирование ошибки
  console.error('❌ Ошибка:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
  });

  // Если это наша кастомная ошибка
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
  }

  // Ошибки валидации MongoDB
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Ошибка валидации данных',
      details: err.errors,
    });
  }

  // Ошибки дубликата (unique index)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0];
    return res.status(409).json({
      error: `Дубликат: ${field} уже существует`,
      code: 'DUPLICATE',
    });
  }

  // Ошибки кастинга ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Неверный формат ID',
      code: 'INVALID_ID',
    });
  }

  // Общая ошибка сервера
  return res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : err.message,
    code: 'INTERNAL_ERROR',
  });
}
