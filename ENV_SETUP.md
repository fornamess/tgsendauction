# Настройка переменных окружения

## Для локальной разработки

Создайте файл `backend/.env`:

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/auction_db
TELEGRAM_BOT_TOKEN=8090299133:AAHL83f8hxEPwtc_iv8CH9cGQqmcHmRtHfk
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

## Для production на Amvera

В панели Amvera добавьте переменные окружения:

- `TELEGRAM_BOT_TOKEN` = `8090299133:AAHL83f8hxEPwtc_iv8CH9cGQqmcHmRtHfk`
- `VITE_API_URL` = URL вашего API (например: `https://api.your-domain.amvera.io`)
- `ALLOWED_ORIGINS` = `https://your-domain.amvera.io,https://web.telegram.org,https://t.me`
- `MONGODB_URI` = URI MongoDB (если используете внешнюю БД)
- `PORT` = `3000`
- `NODE_ENV` = `production`

⚠️ **ВАЖНО**: Файл `.env` находится в `.gitignore` и не будет закоммичен для безопасности!
