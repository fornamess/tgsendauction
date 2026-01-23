import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import AdminPage from './pages/AdminPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';

const TEST_USERS = [
  { id: 'user1', name: 'Пользователь 1' },
  { id: 'user2', name: 'Пользователь 2' },
  { id: 'user3', name: 'Пользователь 3' },
  { id: 'admin', name: 'Администратор' },
];

function App() {
  const [userId, setUserId] = useState<string>('');
  const [showUserSwitcher, setShowUserSwitcher] = useState(false);

  useEffect(() => {
    // Загружаем сохраненный userId из localStorage
    const savedUserId = localStorage.getItem('userId');
    if (savedUserId) {
      setUserId(savedUserId);
    } else {
      // По умолчанию используем первого пользователя
      const defaultUserId = TEST_USERS[0].id;
      setUserId(defaultUserId);
      localStorage.setItem('userId', defaultUserId);
    }
  }, []);

  const handleUserChange = (newUserId: string) => {
    setUserId(newUserId);
    localStorage.setItem('userId', newUserId);
    setShowUserSwitcher(false);
    // Перезагружаем страницу для применения изменений
    window.location.reload();
  };

  const currentUser = TEST_USERS.find(u => u.id === userId) || TEST_USERS[0];

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
            <button
              onClick={() => setShowUserSwitcher(!showUserSwitcher)}
              className="user-switcher-btn"
            >
              {currentUser.name}
            </button>
            {showUserSwitcher && (
              <div className="user-switcher-menu">
                {TEST_USERS.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleUserChange(user.id)}
                    className={userId === user.id ? 'active' : ''}
                  >
                    {user.name}
                  </button>
                ))}
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
