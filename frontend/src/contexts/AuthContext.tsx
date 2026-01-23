import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import api from '../utils/api';
import { getTelegramInitData, getTelegramUser, isTelegramWebApp } from '../utils/telegram';

interface TelegramUserInfo {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

interface AuthContextType {
  user: TelegramUserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TelegramUserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Проверяем, запущено ли в Telegram Mini App
      if (isTelegramWebApp()) {
        const tgUser = getTelegramUser();
        if (tgUser) {
          setUser({
            id: tgUser.id,
            firstName: tgUser.first_name,
            lastName: tgUser.last_name,
            username: tgUser.username,
            photoUrl: tgUser.photo_url,
          });
          setIsLoading(false);
          return;
        }

        // Если в Telegram, но нет данных пользователя, проверяем токен из URL
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('start') || urlParams.get('token') || localStorage.getItem('auth_token');

        if (token) {
          await verifyToken(token);
        }
      } else {
        // Вне Telegram - проверяем токен из URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('start') || urlParams.get('token');

        // Если есть токен в URL, но нет Telegram WebApp, значит пользователь еще не авторизован
        // Просто очищаем токен из URL
        if (urlToken && !isTelegramWebApp()) {
          const url = new URL(window.location.href);
          url.searchParams.delete('start');
          url.searchParams.delete('token');
          window.history.replaceState({}, '', url.toString());
        }
      }
    } catch (error) {
      console.error('Ошибка проверки авторизации:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyToken = async (token: string) => {
    try {
      // Проверяем, что мы в Telegram WebApp
      if (!isTelegramWebApp()) {
        throw new Error('Верификация токена возможна только в Telegram WebApp');
      }

      const initData = getTelegramInitData();
      if (!initData) {
        throw new Error('Telegram данные не доступны');
      }

      const response = await api.post('/api/auth/verify-token', { token });

      if (response.data.success && response.data.user) {
        const userData = response.data.user;
        setUser({
          id: userData.telegramId,
          firstName: userData.firstName || '',
          lastName: userData.lastName,
          username: userData.username,
          photoUrl: userData.photoUrl,
        });

        // Удаляем токен из localStorage и URL
        localStorage.removeItem('auth_token');
        const url = new URL(window.location.href);
        url.searchParams.delete('start');
        url.searchParams.delete('token');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (error) {
      console.error('Ошибка верификации токена:', error);
      // Удаляем невалидный токен
      localStorage.removeItem('auth_token');
      throw error;
    }
  };

  const login = async () => {
    // Если в Telegram, данные уже должны быть загружены
    if (isTelegramWebApp()) {
      const tgUser = getTelegramUser();
      if (tgUser) {
        setUser({
          id: tgUser.id,
          firstName: tgUser.first_name,
          lastName: tgUser.last_name,
          username: tgUser.username,
          photoUrl: tgUser.photo_url,
        });
        return;
      }
    }

    // Генерируем токен и перенаправляем в бота
    try {
      const response = await api.post('/api/auth/generate-token');
      const { token } = response.data;

      if (!token) {
        throw new Error('Токен не получен');
      }

      // Сохраняем токен в localStorage на случай, если пользователь вернется
      localStorage.setItem('auth_token', token);

      // Перенаправляем в бота с токеном
      // Бот должен отправить пользователя обратно на сайт через Telegram WebApp
      window.location.href = `https://t.me/RobuxAuction_bot?start=${token}`;
    } catch (error) {
      console.error('Ошибка генерации токена:', error);
      // Fallback: открываем бота без токена
      alert('Ошибка авторизации. Попробуйте открыть бота вручную: @RobuxAuction_bot');
      window.open('https://t.me/RobuxAuction_bot', '_blank');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth_token');
  };

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
