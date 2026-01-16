FROM node:18-alpine

WORKDIR /app

# Копируем package файлы
COPY package*.json ./

# Устанавливаем все зависимости (включая dev для сборки)
RUN npm ci

# Копируем исходный код
COPY . .

# Собираем TypeScript
RUN npm run build

# Проверяем, что dist создан
RUN ls -la dist/ || (echo "ERROR: dist directory not found!" && exit 1)

# Удаляем dev зависимости после сборки (но сохраняем dist и TypeScript для возможной пересборки)
RUN npm prune --production && npm install --save-dev typescript

# Открываем порт
EXPOSE 3000

# Скрипт запуска: проверяем наличие dist, если нет - собираем
CMD sh -c "if [ ! -d dist ] || [ ! -f dist/app.js ]; then echo 'Building TypeScript...' && npm install typescript --save-dev && npm run build; fi && npm start"
