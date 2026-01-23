import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import AdminPage from './pages/AdminPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import { getTelegramUser, getTelegramWebApp, isTelegramWebApp } from './utils/telegram';

interface TelegramUserInfo {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

function App() {
  const [user, setUser] = useState<TelegramUserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } else {
        setError('Не удалось получить данные пользователя из Telegram');
      }
    } else {
      // Не в Telegram - показываем сообщение
      // В development режиме разрешаем работу для тестирования
      if (import.meta.env.DEV) {
        // Для разработки создаем тестового пользователя
        setUser({
          id: 123456789,
          firstName: 'Test',
          lastName: 'User',
          username: 'testuser',
        });
      } else {
        setError('Приложение доступно только через Telegram');
      }
    }
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="App loading-screen">
        <div className="loading-spinner"></div>
        <p>Загрузка...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App error-screen">
        <div className="error-content">
          <h1>Аукцион Робуксов</h1>
          <p className="error-message">{error}</p>
          <p className="error-hint">
            Откройте приложение через бота в Telegram:
          </p>
          <a 
            href="https://t.me/YOUR_BOT_USERNAME" 
            className="telegram-button"
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть в Telegram
          </a>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="App error-screen">
        <p>Ошибка авторизации</p>
      </div>
    );
  }

  const userId = `tg_${user.id}`;
  const displayName = user.username || `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;

  return (
    <BrowserRouter>
      <div className="App">
        <header className="App-header">
          <nav>
            <a href="/">Аукцион</a>
            <a href="/profile">Профиль</a>
            <a href="/admin">Админ</a>
          </nav>
          <div className="user-info">
            {user.photoUrl && (
              <img 
                src={user.photoUrl} 
                alt="avatar" 
                className="user-avatar"
              />
            )}
            <span>{displayName}</span>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<HomePage userId={userId} />} />
            <Route path="/profile" element={<ProfilePage userId={userId} />} />
            <Route path="/admin" element={<AdminPage userId={userId} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
