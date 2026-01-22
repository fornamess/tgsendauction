import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer: MongoMemoryReplSet;

// Подключение к тестовой БД перед всеми тестами
beforeAll(async () => {
  // Используем MongoMemoryReplSet для поддержки транзакций MongoDB
  // Single-node replica set достаточно для тестов
  mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  await mongoServer.waitUntilRunning();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
}, 120000); // Увеличиваем timeout для установки MongoDB с replica set

// Очистка БД после каждого теста
afterEach(async () => {
  // Очищаем кеши перед очисткой данных
  try {
    // Очищаем кеш RoundService
    const { roundCache } = await import('../services/RoundService');
    if (roundCache && typeof roundCache.clear === 'function') {
      roundCache.clear();
    }
    // Очищаем кеш AuctionService
    const { auctionCache } = await import('../services/AuctionService');
    if (auctionCache && typeof auctionCache.clear === 'function') {
      auctionCache.clear();
    }
  } catch (error) {
    // Игнорируем ошибки очистки кеша
  }

  // Очищаем все коллекции (включая IdempotentRequest для предотвращения конфликтов)
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    try {
      const collection = collections[key];
      await collection.deleteMany({});
    } catch (error) {
      // Игнорируем ошибки при очистке
    }
  }
});

// Отключение от БД после всех тестов
afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
}, 60000);
