/**
 * Утилита для безопасной обработки ошибок API
 */
export interface ApiError {
  response?: {
    data?: {
      error?: string;
    };
  };
  message?: string;
}

/**
 * Извлечь сообщение об ошибке из ответа API
 */
export function getErrorMessage(error: unknown, defaultMessage: string = 'Произошла ошибка'): string {
  const apiError = error as ApiError;
  return apiError?.response?.data?.error || apiError?.message || defaultMessage;
}
