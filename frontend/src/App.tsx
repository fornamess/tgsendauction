import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import './App.css';

function App() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Получить или создать userId
    let storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      storedUserId = `user_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('userId', storedUserId);
    }
    setUserId(storedUserId);
  }, []);

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
            Пользователь: {userId}
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
