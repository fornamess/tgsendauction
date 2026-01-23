import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getTelegramUser, isTelegramWebApp } from '../utils/telegram';

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
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TelegramUserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
      }
    }
    setIsLoading(false);
  }, []);

  const login = () => {
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
      }
    } else {
      // Вне Telegram - открываем бота
      window.open('https://t.me/RobuxAuction_bot?start=webapp', '_blank');
    }
  };

  const logout = () => {
    setUser(null);
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
