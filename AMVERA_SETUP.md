# Настройка на Amvera

## Переменные окружения

В панели Amvera добавьте следующие переменные окружения:

### Backend
- `NODE_ENV` = `production`
- `PORT` = `3000`
- `MONGODB_URI` = `mongodb://mongodb:27017/auction_db` (или внешняя БД)
- `TELEGRAM_BOT_TOKEN` = `8090299133:AAHL83f8hxEPwtc_iv8CH9cGQqmcHmRtHfk`
- `ALLOWED_ORIGINS` = `https://your-domain.amvera.io,https://web.telegram.org,https://t.me`

### Frontend
- `VITE_API_URL` = URL вашего backend API

## Деплой

Amvera автоматически развернет проект при push в репозиторий:
```bash
git push amvera main
```

## Структура проекта

- `backend/` - Node.js/Express API
- `frontend/` - React фронтенд
- `docker-compose.yml` - Конфигурация для локальной разработки

## Настройка Telegram Bot

1. Откройте @BotFather в Telegram
2. Выберите вашего бота
3. Bot Settings → Menu Button
4. Установите URL вашего Mini App: `https://your-domain.amvera.io`

## Проверка работы

После деплоя проверьте:
1. Health check: `https://api.your-domain.amvera.io/health`
2. Откройте Telegram Bot
3. Проверьте работу Mini App
