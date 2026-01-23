# Multi-stage build для production
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Копируем и устанавливаем зависимости frontend (кешируется если package.json не изменился)
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# Копируем исходники и собираем frontend
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend builder
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend

# Копируем и устанавливаем зависимости backend (кешируется если package.json не изменился)
COPY backend/package*.json ./
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# Копируем исходники и собираем backend
COPY backend/ ./
RUN npm run build

# Stage 3: Production image - используем Ubuntu для MongoDB
FROM ubuntu:22.04

# Устанавливаем переменные окружения для non-interactive установки
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=UTC \
    NODE_ENV=production \
    PORT=3000 \
    MONGODB_URI=mongodb://localhost:27017/auction_db \
    TELEGRAM_BOT_TOKEN=8090299133:AAHL83f8hxEPwtc_iv8CH9cGQqmcHmRtHfk

# Устанавливаем необходимые пакеты за один RUN для лучшего кеширования
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    nginx \
    supervisor \
    ca-certificates \
    bash \
    apt-transport-https \
    && curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor \
    && echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        nodejs \
        mongodb-org \
        mongodb-mongosh \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* \
    && unset DEBIAN_FRONTEND

# Создаем директории
WORKDIR /app

# Копируем собранный frontend
COPY --from=frontend-builder /app/frontend/dist /var/www/html

# Копируем собранный backend
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package*.json ./backend/
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules

# Копируем конфигурацию nginx
COPY frontend/nginx.conf /etc/nginx/sites-available/default
RUN rm -f /etc/nginx/sites-enabled/default \
    && ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Копируем конфигурации supervisor и скрипты
RUN mkdir -p /etc/supervisor/conf.d
COPY docker/supervisor/mongodb.conf docker/supervisor/backend.conf docker/supervisor/nginx.conf /etc/supervisor/conf.d/
COPY docker/supervisor/supervisord.conf /etc/supervisor/
COPY docker/wait-for-mongo.sh /app/wait-for-mongo.sh
RUN chmod +x /app/wait-for-mongo.sh

# Создаем директорию для MongoDB данных с правильными правами
RUN mkdir -p /data/db && \
    chmod 755 /data/db && \
    chown -R root:root /data/db

# Открываем порты
EXPOSE 80 3000 27017

# Запускаем supervisord который управляет всеми процессами
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
