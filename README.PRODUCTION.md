# Production Setup - Telegram Mini App

Инструкция по развертыванию в production для Telegram Mini App.

## Требования

1. Docker и Docker Compose
2. Telegram Bot Token (получить у @BotFather)
3. Домен для развертывания (например, через Amvera)
4. HTTPS сертификат (обязательно для Telegram Mini App)

## Настройка

### 1. Создание .env.prod файла

Создайте файл `.env.prod` в корне проекта:

```bash
# Telegram Bot Token (получить у @BotFather)
TELEGRAM_BOT_TOKEN=8090299133:AAHL83f8hxEPwtc_iv8CH9cGQqmcHmRtHfk

# API URL для frontend (замените на ваш домен)
VITE_API_URL=https://api.your-domain.com

# Разрешенные домены для CORS (через запятую)
ALLOWED_ORIGINS=https://your-domain.t.me,https://web.telegram.org,https://t.me

# MongoDB (если используется внешняя БД)
# MONGODB_URI=mongodb://user:password@host:27017/auction_db

# Port
PORT=3000
```

### 2. Настройка Telegram Bot

1. Создайте бота через @BotFather в Telegram
2. Получите токен бота
3. Добавьте токен в `.env.prod` файл

### 3. Настройка Telegram Mini App

1. Откройте @BotFather
2. Выберите вашего бота
3. Выберите "Bot Settings" → "Menu Button"
4. Установите URL вашего Mini App (например: `https://your-domain.t.me`)

### 4. Сборка и запуск

```bash
# Сборка production образов
docker-compose -f docker-compose.prod.yml build

# Запуск
docker-compose -f docker-compose.prod.yml up -d

# Просмотр логов
docker-compose -f docker-compose.prod.yml logs -f

# Остановка
docker-compose -f docker-compose.prod.yml down
```

### 5. Проверка работы

1. Откройте Telegram
2. Найдите вашего бота
3. Нажмите на кнопку меню (если настроена) или перейдите по ссылке Mini App
4. Проверьте авторизацию и работу всех функций

## Безопасность

### HTTPS обязателен

Telegram Mini App требует HTTPS. Используйте:
- Let's Encrypt (бесплатно)
- Cloudflare (бесплатно с проксированием)
- Ваш хостинг-провайдер (например, Amvera)

### Переменные окружения

Никогда не коммитьте `.env.prod` в git! Используйте `.env.prod.example` как шаблон.

### MongoDB

В production рекомендуется:
- Использовать внешний MongoDB (например, MongoDB Atlas)
- Настроить аутентификацию
- Включить replica set для транзакций
- Настроить бэкапы

### Rate Limiting

Уже настроен по умолчанию:
- 100 запросов на 15 минут для всех API
- 10 ставок в минуту
- 5 пополнений в минуту

Можно настроить в `.env.prod`:
```bash
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Развертывание на Amvera

### Подготовка

1. Зарегистрируйтесь на Amvera
2. Создайте новый проект
3. Подключите репозиторий GitHub

### Настройка переменных окружения

В панели Amvera добавьте переменные:
- `TELEGRAM_BOT_TOKEN` - токен бота
- `VITE_API_URL` - URL API
- `ALLOWED_ORIGINS` - разрешенные домены
- `MONGODB_URI` - URI MongoDB (если используется внешняя)

### Деплой

Amvera автоматически соберет и задеплоит проект при push в репозиторий.

## Мониторинг

### Health Check

Endpoint `/health` возвращает статус сервера:
```bash
curl https://api.your-domain.com/health
```

### Логи

Просмотр логов:
```bash
# Backend
docker-compose -f docker-compose.prod.yml logs -f backend

# Frontend
docker-compose -f docker-compose.prod.yml logs -f frontend
```

## Troubleshooting

### Telegram Mini App не открывается

1. Проверьте, что URL начинается с `https://`
2. Проверьте настройки бота в @BotFather
3. Проверьте CORS настройки в backend

### Авторизация не работает

1. Проверьте `TELEGRAM_BOT_TOKEN` в `.env.prod`
2. Проверьте логи backend на наличие ошибок
3. Убедитесь, что frontend отправляет `X-Telegram-Init-Data` заголовок

### Ошибки подключения к MongoDB

1. Проверьте `MONGODB_URI` в `.env.prod`
2. Проверьте доступность MongoDB
3. Проверьте credentials

## Масштабирование

Для масштабирования:
1. Используйте load balancer (например, Nginx)
2. Запустите несколько инстансов backend
3. Используйте Redis для сессий и кэша
4. Настройте MongoDB replica set

## Обновление

```bash
# Остановка
docker-compose -f docker-compose.prod.yml down

# Обновление кода
git pull

# Пересборка
docker-compose -f docker-compose.prod.yml build

# Запуск
docker-compose -f docker-compose.prod.yml up -d
```
