import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import AdminPage from './pages/AdminPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';

function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [showUserSwitcher, setShowUserSwitcher] = useState(false);

  useEffect(() => {
    // Получить или создать userId
    let storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      storedUserId = `user_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('userId', storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  const handleNewUser = () => {
    const newUserId = `user_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('userId', newUserId);
    setUserId(newUserId);
    setShowUserSwitcher(false);
    window.location.reload(); // Перезагружаем для применения нового userId
  };

  if (!userId) {
    return <div>Загрузка...</div>;
  }

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
            <span>Пользователь: {userId}</span>
            <button
              onClick={() => setShowUserSwitcher(!showUserSwitcher)}
              style={{
                marginLeft: '10px',
                padding: '4px 8px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              ⚙️
            </button>
            {showUserSwitcher && (
              <div className="user-switcher-menu">
                <button onClick={handleNewUser}>Создать нового пользователя</button>
                <p>Для тестирования можно переключаться между пользователями</p>
              </div>
            )}
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
