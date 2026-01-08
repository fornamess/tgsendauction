import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Добавить авторизацию в заголовки для всех запросов
api.interceptors.request.use((config) => {
  // Проверяем, запущено ли приложение в Telegram Mini App
  if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
    const tg = (window as any).Telegram.WebApp;
    const initData = tg.initData;
    if (initData) {
      config.headers['X-Telegram-Init-Data'] = initData;
    }
  }

  // Fallback для обычной авторизации (для разработки)
  if (!config.headers['X-Telegram-Init-Data']) {
    const userId = localStorage.getItem('userId');
    if (userId) {
      config.headers['X-User-Id'] = userId;
    }
  }

  return config;
});

export default api;
