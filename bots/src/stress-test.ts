import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface StressTestConfig {
  numBots: number;
  numConcurrentBets: number;
  betAmountMin: number;
  betAmountMax: number;
  rounds: number;
  delayBetweenRounds: number;
}

/**
 * Стресс-тест: одновременные ставки от множества ботов
 */
async function stressTest() {
  const config: StressTestConfig = {
    numBots: parseInt(process.env.NUM_BOTS || '100'),
    numConcurrentBets: parseInt(process.env.NUM_CONCURRENT || '500'),
    betAmountMin: parseInt(process.env.BET_MIN || '1000'),
    betAmountMax: parseInt(process.env.BET_MAX || '50000'),
    rounds: parseInt(process.env.ROUNDS || '5'),
    delayBetweenRounds: parseInt(process.env.DELAY || '2000'),
  };

  console.log(`🔥 Стресс-тест запущен:`);
  console.log(`   Ботов: ${config.numBots}`);
  console.log(`   Одновременных ставок: ${config.numConcurrentBets}`);
  console.log(`   Раундов: ${config.rounds}`);
  console.log(`   Диапазон ставок: ${config.betAmountMin} - ${config.betAmountMax} руб.\n`);

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

  // Выполнить несколько раундов тестирования
  const allResults: any[] = [];
  
  for (let round = 1; round <= config.rounds; round++) {
    console.log(`\n📦 Раунд ${round}/${config.rounds}`);
    
    // Получить актуальный раунд
    let currentRoundId: string;
    try {
      const response = await axios.get(`${API_URL}/api/round/current`, {
        headers: { 'X-User-Id': 'stress_test' },
      });
      if (!response.data.round) {
        console.log('⚠️  Нет активного раунда, пропускаю...');
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenRounds));
        continue;
      }
      currentRoundId = response.data.round._id;
    } catch (error: any) {
      console.error('❌ Ошибка получения раунда:', error.message);
      await new Promise(resolve => setTimeout(resolve, config.delayBetweenRounds));
      continue;
    }

    // Выполнить одновременные ставки
    const startTime = Date.now();
    const promises: Promise<any>[] = [];

    for (let i = 0; i < config.numConcurrentBets; i++) {
      const botIndex = i % bots.length;
      const userId = bots[botIndex];
      const amount = Math.floor(
        Math.random() * (config.betAmountMax - config.betAmountMin) + config.betAmountMin
      );

      const promise = axios
        .post(
          `${API_URL}/api/bet`,
          { roundId: currentRoundId, amount },
          { 
            headers: { 'X-User-Id': userId },
            timeout: 10000,
          }
        )
        .then(() => ({ success: true, userId, amount, round }))
        .catch((error: any) => ({
          success: false,
          userId,
          amount,
          round,
          error: error.response?.data?.error || error.message,
          status: error.response?.status,
        }));

      promises.push(promise);
    }

    console.log(`⏳ Выполняю ${config.numConcurrentBets} одновременных запросов...`);

    const results = await Promise.allSettled(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Обработка результатов
    const processedResults = results.map((r, idx) => {
      if (r.status === 'fulfilled') {
        return r.value;
      } else {
        return {
          success: false,
          userId: bots[idx % bots.length],
          amount: 0,
          round,
          error: r.reason?.message || 'Unknown error',
        };
      }
    });

    allResults.push(...processedResults);

    // Анализ результатов раунда
    const success = processedResults.filter(r => r.success).length;
    const failed = processedResults.filter(r => !r.success).length;
    const errors = new Map<string, number>();

    processedResults.forEach(r => {
      if (!r.success && r.error) {
        errors.set(r.error, (errors.get(r.error) || 0) + 1);
      }
    });

    console.log(`   ✅ Успешно: ${success}/${config.numConcurrentBets}`);
    console.log(`   ❌ Ошибок: ${failed}/${config.numConcurrentBets}`);
    console.log(`   ⏱️  Время: ${duration}ms`);
    console.log(`   📈 RPS: ${((config.numConcurrentBets / duration) * 1000).toFixed(2)}`);

    if (errors.size > 0) {
      console.log(`   ⚠️  Типы ошибок:`);
      errors.forEach((count, error) => {
        console.log(`      - ${error}: ${count}`);
      });
    }

    // Задержка между раундами
    if (round < config.rounds) {
      await new Promise(resolve => setTimeout(resolve, config.delayBetweenRounds));
    }
  }

  // Итоговая статистика
  const totalSuccess = allResults.filter(r => r.success).length;
  const totalFailed = allResults.filter(r => !r.success).length;
  const totalRequests = allResults.length;
  const totalErrors = new Map<string, number>();

  allResults.forEach(r => {
    if (!r.success && r.error) {
      totalErrors.set(r.error, (totalErrors.get(r.error) || 0) + 1);
    }
  });

  console.log(`\n📊 ИТОГОВАЯ СТАТИСТИКА:`);
  console.log(`   Всего запросов: ${totalRequests}`);
  console.log(`   Успешных: ${totalSuccess} (${((totalSuccess / totalRequests) * 100).toFixed(2)}%)`);
  console.log(`   Ошибок: ${totalFailed} (${((totalFailed / totalRequests) * 100).toFixed(2)}%)`);

  if (totalErrors.size > 0) {
    console.log(`\n❌ Распределение ошибок:`);
    totalErrors.forEach((count, error) => {
      console.log(`   ${error}: ${count} (${((count / totalFailed) * 100).toFixed(2)}%)`);
    });
  }

  console.log(`\n✅ Стресс-тест завершен`);
}

// Запуск
stressTest().catch(console.error);
