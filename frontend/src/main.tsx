import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initTelegramWebApp } from './utils/telegram';

// Инициализируем Telegram WebApp если запущено в Telegram
initTelegramWebApp();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
