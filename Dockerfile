# Multi-stage build для production
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Копируем и устанавливаем зависимости frontend
COPY frontend/package*.json ./
RUN npm install

# Копируем исходники и собираем frontend
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend builder
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend

# Копируем и устанавливаем зависимости backend
COPY backend/package*.json ./
RUN npm install

# Копируем исходники и собираем backend
COPY backend/ ./
RUN npm run build

# Stage 3: Production image - используем Ubuntu для MongoDB
FROM ubuntu:22.04

# Устанавливаем необходимые пакеты
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    nginx \
    supervisor \
    ca-certificates \
    bash \
    && curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor \
    && echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list \
    && apt-get update \
    && apt-get install -y mongodb-org mongodb-mongosh \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Устанавливаем Node.js 18
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

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

# Создаем конфигурацию supervisord для процессов
RUN mkdir -p /etc/supervisor/conf.d

# Конфигурация для MongoDB
RUN echo '[program:mongodb]' > /etc/supervisor/conf.d/mongodb.conf && \
    echo 'command=/bin/bash -c "mkdir -p /data/db && chmod 755 /data/db && /usr/bin/mongod --bind_ip_all --dbpath /data/db --noauth"' >> /etc/supervisor/conf.d/mongodb.conf && \
    echo 'autostart=true' >> /etc/supervisor/conf.d/mongodb.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/mongodb.conf && \
    echo 'stderr_logfile=/var/log/mongodb.err.log' >> /etc/supervisor/conf.d/mongodb.conf && \
    echo 'stdout_logfile=/var/log/mongodb.out.log' >> /etc/supervisor/conf.d/mongodb.conf && \
    echo 'priority=10' >> /etc/supervisor/conf.d/mongodb.conf && \
    echo 'user=root' >> /etc/supervisor/conf.d/mongodb.conf && \
    echo 'startsecs=5' >> /etc/supervisor/conf.d/mongodb.conf

# Создаем скрипт ожидания MongoDB
RUN echo '#!/bin/bash' > /app/wait-for-mongo.sh && \
    echo 'until mongosh --eval "db.adminCommand(\"ping\")" 2>/dev/null; do' >> /app/wait-for-mongo.sh && \
    echo '  echo "Waiting for MongoDB..."' >> /app/wait-for-mongo.sh && \
    echo '  sleep 2' >> /app/wait-for-mongo.sh && \
    echo 'done' >> /app/wait-for-mongo.sh && \
    echo 'echo "MongoDB is ready!"' >> /app/wait-for-mongo.sh && \
    chmod +x /app/wait-for-mongo.sh

# Конфигурация для Backend
RUN echo '[program:backend]' > /etc/supervisor/conf.d/backend.conf && \
    echo 'command=/bin/bash -c "/app/wait-for-mongo.sh && node /app/backend/dist/app.js"' >> /etc/supervisor/conf.d/backend.conf && \
    echo 'directory=/app/backend' >> /etc/supervisor/conf.d/backend.conf && \
    echo 'autostart=true' >> /etc/supervisor/conf.d/backend.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/backend.conf && \
    echo 'stderr_logfile=/var/log/backend.err.log' >> /etc/supervisor/conf.d/backend.conf && \
    echo 'stdout_logfile=/var/log/backend.out.log' >> /etc/supervisor/conf.d/backend.conf && \
    echo 'environment=NODE_ENV="production",PORT="3000",MONGODB_URI="mongodb://localhost:27017/auction_db",TELEGRAM_BOT_TOKEN="8090299133:AAHL83f8hxEPwtc_iv8CH9cGQqmcHmRtHfk"' >> /etc/supervisor/conf.d/backend.conf && \
    echo 'priority=20' >> /etc/supervisor/conf.d/backend.conf

# Конфигурация для Nginx
RUN echo '[program:nginx]' > /etc/supervisor/conf.d/nginx.conf && \
    echo 'command=/usr/sbin/nginx -g "daemon off;"' >> /etc/supervisor/conf.d/nginx.conf && \
    echo 'autostart=true' >> /etc/supervisor/conf.d/nginx.conf && \
    echo 'autorestart=true' >> /etc/supervisor/conf.d/nginx.conf && \
    echo 'stderr_logfile=/var/log/nginx.err.log' >> /etc/supervisor/conf.d/nginx.conf && \
    echo 'stdout_logfile=/var/log/nginx.out.log' >> /etc/supervisor/conf.d/nginx.conf && \
    echo 'priority=30' >> /etc/supervisor/conf.d/nginx.conf

# Создаем директорию для MongoDB данных с правильными правами
RUN mkdir -p /data/db && \
    chmod 755 /data/db && \
    chown -R root:root /data/db

# Открываем порты
EXPOSE 80 3000 27017

# Переменные окружения по умолчанию
ENV NODE_ENV=production
ENV PORT=3000
ENV MONGODB_URI=mongodb://localhost:27017/auction_db
ENV TELEGRAM_BOT_TOKEN=8090299133:AAHL83f8hxEPwtc_iv8CH9cGQqmcHmRtHfk

# Создаем основной конфигурационный файл supervisord
RUN echo '[supervisord]' > /etc/supervisor/supervisord.conf && \
    echo 'nodaemon=true' >> /etc/supervisor/supervisord.conf && \
    echo 'user=root' >> /etc/supervisor/supervisord.conf && \
    echo '[include]' >> /etc/supervisor/supervisord.conf && \
    echo 'files = /etc/supervisor/conf.d/*.conf' >> /etc/supervisor/supervisord.conf

# Запускаем supervisord который управляет всеми процессами
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
