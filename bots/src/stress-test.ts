import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

/**
 * Стресс-тест: одновременные ставки от множества ботов
 */
async function stressTest() {
  const numBots = parseInt(process.env.NUM_BOTS || '50');
  const numConcurrentBets = parseInt(process.env.NUM_CONCURRENT || '100');

  console.log(`🔥 Стресс-тест: ${numBots} ботов, ${numConcurrentBets} одновременных ставок`);

  // Получить текущий раунд
  let roundId: string;
  try {
    const response = await axios.get(`${API_URL}/api/round/current`, {
      headers: { 'X-User-Id': 'test' },
    });
    if (!response.data.round) {
      throw new Error('Нет активного раунда');
    }
    roundId = response.data.round._id;
    console.log(`✅ Раунд найден: ${roundId}`);
  } catch (error: any) {
    console.error('❌ Ошибка получения раунда:', error.message);
    return;
  }

  // Создать ботов и пополнить баланс
  const bots: string[] = [];
  for (let i = 0; i < numBots; i++) {
    const userId = `stress_bot_${i + 1}`;
    bots.push(userId);

    try {
      await axios.post(
        `${API_URL}/api/user/deposit`,
        { amount: 100000 },
        { headers: { 'X-User-Id': userId } }
      );
    } catch (error: any) {
      console.error(`Ошибка пополнения ${userId}:`, error.message);
    }
  }

  console.log(`✅ Все боты созданы и пополнили баланс`);

  // Выполнить одновременные ставки
  const startTime = Date.now();
  const promises: Promise<any>[] = [];

  for (let i = 0; i < numConcurrentBets; i++) {
    const botIndex = i % bots.length;
    const userId = bots[botIndex];
    const amount = Math.floor(Math.random() * 20000 + 1000);

    const promise = axios
      .post(
        `${API_URL}/api/bet`,
        { roundId, amount },
        { headers: { 'X-User-Id': userId } }
      )
      .then(() => ({ success: true, userId, amount }))
      .catch((error: any) => ({
        success: false,
        userId,
        amount,
        error: error.response?.data?.error || error.message,
      }));

    promises.push(promise);
  }

  console.log(`⏳ Выполняю ${numConcurrentBets} одновременных запросов...`);

  const results = await Promise.all(promises);
  const endTime = Date.now();
  const duration = endTime - startTime;

  // Анализ результатов
  const success = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const errors = new Map<string, number>();

  results.forEach(r => {
    if (!r.success && r.error) {
      errors.set(r.error, (errors.get(r.error) || 0) + 1);
    }
  });

  console.log(`\n📊 Результаты стресс-теста:`);
  console.log(`   Время выполнения: ${duration}ms`);
  console.log(`   Успешных запросов: ${success}/${numConcurrentBets}`);
  console.log(`   Неудачных запросов: ${failed}/${numConcurrentBets}`);
  console.log(`   RPS: ${((numConcurrentBets / duration) * 1000).toFixed(2)}`);

  if (errors.size > 0) {
    console.log(`\n❌ Типы ошибок:`);
    errors.forEach((count, error) => {
      console.log(`   ${error}: ${count}`);
    });
  }

  console.log(`\n✅ Стресс-тест завершен`);
}

// Запуск
stressTest().catch(console.error);
