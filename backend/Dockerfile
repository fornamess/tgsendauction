FROM node:18-alpine

WORKDIR /app

# Копируем package файлы
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Для разработки используем tsx напрямую
ENV NODE_ENV=development

EXPOSE 3000

# Используем tsx для запуска TypeScript напрямую
CMD ["npx", "tsx", "src/app.ts"]
