# Настройка .env файлов

## Для локальной разработки

Создайте файл `backend/.env`:

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/auction_db
TELEGRAM_BOT_TOKEN=8090299133:AAHL83f8hxEPwtc_iv8CH9cGQqmcHmRtHfk
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

## Для production

Создайте файл `.env.prod` в корне проекта:

```env
TELEGRAM_BOT_TOKEN=8090299133:AAHL83f8hxEPwtc_iv8CH9cGQqmcHmRtHfk
VITE_API_URL=https://api.your-domain.com
ALLOWED_ORIGINS=https://your-domain.t.me,https://web.telegram.org,https://t.me
PORT=3000
MONGODB_URI=mongodb://mongodb:27017/auction_db
```

⚠️ **ВАЖНО**: Эти файлы находятся в `.gitignore` и не будут закоммичены!
