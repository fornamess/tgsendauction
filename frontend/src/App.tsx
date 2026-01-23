import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './App.css';
import AdminPage from './pages/AdminPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthButton from './components/AuthButton';

function AppContent() {
  const { user, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userId = user ? `tg_${user.id}` : null;
  const displayName = user?.username || (user ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}` : '');

  if (isLoading) {
    return (
      <div className="App loading-screen">
        <div className="loading-spinner"></div>
        <p>Загрузка...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="App">
        <header className="App-header">
          <button 
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Меню"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          <nav className={mobileMenuOpen ? 'mobile-open' : ''}>
            <a href="/" onClick={() => setMobileMenuOpen(false)}>Аукцион</a>
            {user && <a href="/profile" onClick={() => setMobileMenuOpen(false)}>Профиль</a>}
            {user && <a href="/admin" onClick={() => setMobileMenuOpen(false)}>Админ</a>}
          </nav>
          <div className="user-info">
            {user ? (
              <>
                {user.photoUrl && (
                  <img 
                    src={user.photoUrl} 
                    alt="avatar" 
                    className="user-avatar"
                  />
                )}
                <span className="user-name">{displayName}</span>
              </>
            ) : (
              <AuthButton />
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

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
