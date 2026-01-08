import { z } from 'zod';

// Схемы валидации для API запросов
export const createAuctionSchema = z.object({
  name: z.string().min(1, 'Название аукциона обязательно').max(200, 'Название слишком длинное'),
  prizeRobux: z.number().int().positive('Приз должен быть положительным числом').max(1000000, 'Слишком большой приз').optional().default(1000),
});

export const placeBetSchema = z.object({
  roundId: z.string().min(1, 'roundId обязателен'),
  amount: z.number().positive('Сумма ставки должна быть положительной').min(1, 'Минимальная ставка: 1 рубль').max(100000000, 'Слишком большая ставка'),
});

export const depositSchema = z.object({
  amount: z.number().positive('Сумма должна быть положительной').min(1, 'Минимальная сумма: 1 рубль').max(100000000, 'Слишком большая сумма'),
});

export const startAuctionSchema = z.object({
  auctionId: z.string().min(1, 'auctionId обязателен'),
});

export const endAuctionSchema = z.object({
  auctionId: z.string().min(1, 'auctionId обязателен'),
});

// Middleware для валидации
export function validateRequest(schema: z.ZodSchema) {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.body || req.params);
      req.validated = validated;
      next();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Ошибка валидации',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      return res.status(400).json({ error: 'Ошибка валидации данных' });
    }
  };
}
