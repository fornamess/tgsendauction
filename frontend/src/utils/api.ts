import axios, { AxiosError, AxiosResponse } from 'axios';

// В production используем относительные пути (nginx проксирует /api/ на backend)
// В development используем localhost:3000
const API_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '' : 'http://localhost:3000');

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 секунд таймаут
});

// Добавить авторизацию в заголовки для всех запросов
api.interceptors.request.use((config) => {
  // Получаем userId из localStorage
  if (typeof window !== 'undefined') {
    const userId = localStorage.getItem('userId');
    if (userId) {
      config.headers['X-User-Id'] = userId;
    }
  }
  return config;
});

// Response interceptor для централизованной обработки ошибок
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<{ error?: string; message?: string }>) => {
    // Обработка различных типов ошибок
    if (error.response) {
      // Сервер ответил с ошибкой
      const status = error.response.status;
      const errorMessage = error.response.data?.error || error.response.data?.message;

      switch (status) {
        case 401:
          // Неавторизован - приложение работает только через Telegram
          if (import.meta.env.DEV) {
            console.warn('Требуется авторизация через Telegram Mini App');
          }
          break;
        case 403:
          // Запрещено
          if (import.meta.env.DEV) {
            console.warn('Доступ запрещен:', errorMessage);
          }
          break;
        case 429:
          // Rate limit
          if (import.meta.env.DEV) {
            console.warn('Превышен лимит запросов');
          }
          break;
        case 500:
          // Серверная ошибка
          if (import.meta.env.DEV) {
            console.error('Серверная ошибка:', errorMessage);
          }
          break;
      }
    } else if (error.request) {
      // Запрос был отправлен, но ответ не получен (сетевая ошибка)
      if (import.meta.env.DEV) {
        console.error('Сетевая ошибка:', error.message);
      }
    } else {
      // Ошибка при настройке запроса
      if (import.meta.env.DEV) {
        console.error('Ошибка запроса:', error.message);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
