import axios, { AxiosError } from 'axios';

const API_URL = process.env.API_URL || 'https://ygth-romansf.waw0.amvera.tech';

interface LoadTestConfig {
  numUsers: number; // Количество пользователей
  balanceMin: number; // Минимальный баланс
  balanceMax: number; // Максимальный баланс
  betAmountMin: number; // Минимальная ставка
  betAmountMax: number; // Максимальная ставка
  concurrentBets: number; // Количество одновременных ставок
  delayBetweenBets: number; // Задержка между ставками (мс)
  rounds: number; // Количество раундов тестирования
}

interface User {
  id: string;
  balance: number;
  betsCount: number;
  successBets: number;
  failedBets: number;
}

interface TestStats {
  totalUsers: number;
  totalBets: number;
  successBets: number;
  failedBets: number;
  errors: Map<string, number>;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  users: User[];
}

/**
 * Создать пользователя и пополнить баланс
 */
async function createUserWithBalance(
  userId: string,
  balance: number,
  apiUrl: string,
  maxRetries: number = 5  // Увеличиваем количество попыток
): Promise<{ success: boolean; error?: string }> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await axios.post(
        `${apiUrl}/api/user/deposit`,
        { amount: balance },
        {
          headers: {
            'X-User-Id': userId,
            'X-Bypass-RateLimit': 'true' // Обход rate limiting для load test
          },
          timeout: 30000, // Увеличиваем таймаут
        }
      );
      return { success: true };
    } catch (error: any) {
      lastError = error;
      const axiosError = error as AxiosError;

      // Не повторяем для клиентских ошибок (4xx), кроме 429
      if (axiosError.response?.status &&
          axiosError.response.status >= 400 &&
          axiosError.response.status < 500 &&
          axiosError.response.status !== 429) {
        break;
      }

      // Для 502/503/504 и network errors - повторяем
      if (attempt < maxRetries && (
        axiosError.response?.status === 502 ||
        axiosError.response?.status === 503 ||
        axiosError.response?.status === 504 ||
        axiosError.code === 'ECONNRESET' ||
        axiosError.code === 'ETIMEDOUT' ||
        axiosError.code === 'ECONNREFUSED' ||
        !axiosError.response
      )) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 10000); // Максимум 10 секунд
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      break;
    }
  }

  const axiosError = lastError as AxiosError;
  const errorMessage =
    (axiosError.response?.data as any)?.error || axiosError.message || 'Unknown error';
  return { success: false, error: errorMessage };
}

/**
 * Получить текущий раунд
 */
async function getCurrentRound(apiUrl: string): Promise<{ roundId: string | null; error?: string }> {
  try {
    const response = await axios.get(`${apiUrl}/api/round/current`, {
      headers: {
        'X-User-Id': 'load_test',
        'X-Bypass-RateLimit': 'true' // Обход rate limiting для load test
      },
      timeout: 10000,
    });
    if (response.data.round && response.data.round._id) {
      return { roundId: response.data.round._id };
    }
    return { roundId: null, error: 'Нет активного раунда' };
  } catch (error: any) {
    const axiosError = error as AxiosError;
    const errorMessage =
      (axiosError.response?.data as any)?.error || axiosError.message || 'Unknown error';
    return { roundId: null, error: errorMessage };
  }
}

/**
 * Сделать ставку с retry логикой
 */
async function placeBet(
  userId: string,
  roundId: string,
  amount: number,
  apiUrl: string,
  maxRetries: number = 5  // Увеличиваем количество попыток для 502 ошибок
): Promise<{ success: boolean; latency: number; error?: string; statusCode?: number }> {
  const startTime = Date.now();
  let lastError: any;
  let lastStatusCode: number | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        `${apiUrl}/api/bet`,
        { roundId, amount },
        {
          headers: {
            'X-User-Id': userId,
            'X-Bypass-RateLimit': 'true' // Обход rate limiting для load test
          },
          timeout: 30000, // Увеличиваем таймаут до 30 секунд
        }
      );
      const latency = Date.now() - startTime;
      return { success: true, latency, statusCode: response.status };
    } catch (error: any) {
      lastError = error;
      const axiosError = error as AxiosError;
      lastStatusCode = axiosError.response?.status;

      // Не повторяем для клиентских ошибок (4xx), кроме 429 (rate limit)
      if (axiosError.response?.status &&
          axiosError.response.status >= 400 &&
          axiosError.response.status < 500 &&
          axiosError.response.status !== 429) {
        break;
      }

      // Не повторяем для ошибок валидации (недостаточно средств и т.д.)
      const errorMessage = (axiosError.response?.data as any)?.error || axiosError.message || '';
      if (errorMessage.includes('Недостаточно средств') ||
          errorMessage.includes('duplicate key') ||
          errorMessage.includes('Раунд не активен')) {
        break;
      }

      // Для 502/503/504 и network errors - повторяем с экспоненциальной задержкой
      if (attempt < maxRetries && (
        axiosError.response?.status === 502 ||
        axiosError.response?.status === 503 ||
        axiosError.response?.status === 504 ||
        axiosError.code === 'ECONNRESET' ||
        axiosError.code === 'ETIMEDOUT' ||
        axiosError.code === 'ECONNREFUSED' ||
        !axiosError.response
      )) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 10000); // Максимум 10 секунд, больше задержка
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      break;
    }
  }

  const latency = Date.now() - startTime;
  const axiosError = lastError as AxiosError;
  const errorMessage =
    (axiosError.response?.data as any)?.error || axiosError.message || 'Unknown error';
  return {
    success: false,
    latency,
    error: errorMessage,
    statusCode: lastStatusCode,
  };
}

/**
 * Основная функция нагрузочного теста
 */
async function runLoadTest(config: LoadTestConfig, apiUrl: string): Promise<TestStats> {
  console.log(`\n🚀 ЗАПУСК НАГРУЗОЧНОГО ТЕСТА АУКЦИОНА`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Конфигурация:`);
  console.log(`   API URL: ${apiUrl}`);
  console.log(`   Пользователей: ${config.numUsers}`);
  console.log(`   Баланс: ${config.balanceMin} - ${config.balanceMax} руб.`);
  console.log(`   Ставки: ${config.betAmountMin} - ${config.betAmountMax} руб.`);
  console.log(`   Одновременных ставок: ${config.concurrentBets}`);
  console.log(`   Раундов тестирования: ${config.rounds}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Проверяем наличие активного раунда
  console.log(`🔍 Проверка активного раунда...`);
  const roundCheck = await getCurrentRound(apiUrl);
  if (!roundCheck.roundId) {
    console.error(`❌ ${roundCheck.error || 'Нет активного раунда'}`);
    console.error(`   Создайте активный раунд перед запуском теста!`);
    process.exit(1);
  }
  console.log(`✅ Активный раунд найден: ${roundCheck.roundId}\n`);

  // Создаем пользователей с рандомными балансами
  console.log(`👥 Создание ${config.numUsers} пользователей...`);
  const users: User[] = [];
  const createPromises: Promise<void>[] = [];

  for (let i = 0; i < config.numUsers; i++) {
    const userId = `load_test_user_${i + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const balance = Math.floor(
      Math.random() * (config.balanceMax - config.balanceMin) + config.balanceMin
    );

    const promise = createUserWithBalance(userId, balance, apiUrl).then((result) => {
      if (result.success) {
        users.push({
          id: userId,
          balance,
          betsCount: 0,
          successBets: 0,
          failedBets: 0,
        });
      } else {
        console.error(`   ❌ Ошибка создания ${userId}: ${result.error}`);
      }
    });

    createPromises.push(promise);

    // Ограничиваем параллельность создания пользователей
    if (createPromises.length >= 50) {
      await Promise.all(createPromises);
      createPromises.length = 0;
      process.stdout.write(`   Создано: ${users.length}/${config.numUsers}\r`);
    }
  }

  // Ждем оставшихся
  if (createPromises.length > 0) {
    await Promise.all(createPromises);
  }

  console.log(`\n✅ Создано пользователей: ${users.length}/${config.numUsers}\n`);

  if (users.length === 0) {
    console.error(`❌ Не удалось создать ни одного пользователя!`);
    process.exit(1);
  }

  // Статистика
  const stats: TestStats = {
    totalUsers: users.length,
    totalBets: 0,
    successBets: 0,
    failedBets: 0,
    errors: new Map(),
    avgLatency: 0,
    minLatency: Infinity,
    maxLatency: 0,
    users: [],
  };

  const latencies: number[] = [];
  let previousSuccessBets = 0;
  let previousFailedBets = 0;

  // Выполняем несколько раундов тестирования
  for (let round = 1; round <= config.rounds; round++) {
    console.log(`\n📦 Раунд тестирования ${round}/${config.rounds}`);

    // Получаем актуальный раунд
    const currentRound = await getCurrentRound(apiUrl);
    if (!currentRound.roundId) {
      console.log(`   ⚠️  Нет активного раунда, пропускаю...`);
      await new Promise((resolve) => setTimeout(resolve, config.delayBetweenBets * 10));
      continue;
    }

    // Делаем ставки с батчингом, чтобы не перегружать сервер
    const betPromises: Promise<void>[] = [];
    const roundStartTime = Date.now();
    const batchSize = Math.min(20, config.concurrentBets); // Максимум 20 одновременных запросов в батче (уменьшено для стабильности)

    // Создаем ставки батчами
    for (let batchStart = 0; batchStart < config.concurrentBets; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, config.concurrentBets);
      const batchPromises: Promise<void>[] = [];

      // Создаем промисы для текущего батча
      for (let i = batchStart; i < batchEnd; i++) {
        const userIndex = Math.floor(Math.random() * users.length);
        const user = users[userIndex];
        const betAmount = Math.floor(
          Math.random() * (config.betAmountMax - config.betAmountMin) + config.betAmountMin
        );

        const promise = placeBet(user.id, currentRound.roundId, betAmount, apiUrl).then(
          (result) => {
            stats.totalBets++;
            user.betsCount++;
            latencies.push(result.latency);

            if (result.latency < stats.minLatency) stats.minLatency = result.latency;
            if (result.latency > stats.maxLatency) stats.maxLatency = result.latency;

            if (result.success) {
              stats.successBets++;
              user.successBets++;
            } else {
              stats.failedBets++;
              user.failedBets++;
              const errorKey = result.error || `HTTP ${result.statusCode || 'Unknown'}`;
              stats.errors.set(errorKey, (stats.errors.get(errorKey) || 0) + 1);
            }
          }
        );

        batchPromises.push(promise);
        betPromises.push(promise);

        // Небольшая задержка между созданием запросов в батче
        if (i < batchEnd - 1 && config.delayBetweenBets > 0) {
          await new Promise((resolve) => setTimeout(resolve, config.delayBetweenBets));
        }
      }

      // Ждем завершения текущего батча перед следующим
      await Promise.allSettled(batchPromises);

      // Небольшая пауза между батчами, чтобы дать серверу передохнуть
      if (batchEnd < config.concurrentBets) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // Увеличена пауза до 500мс
      }
    }

    const roundDuration = Date.now() - roundStartTime;
    const roundSuccess = stats.successBets - previousSuccessBets;
    const roundFailed = stats.failedBets - previousFailedBets;
    previousSuccessBets = stats.successBets;
    previousFailedBets = stats.failedBets;

    console.log(`   ✅ Успешных ставок: ${stats.successBets} (+${roundSuccess})`);
    console.log(`   ❌ Ошибок: ${stats.failedBets} (+${roundFailed})`);
    console.log(`   ⏱️  Время раунда: ${roundDuration}ms`);

    // Задержка между раундами
    if (round < config.rounds) {
      await new Promise((resolve) => setTimeout(resolve, config.delayBetweenBets * 5));
    }
  }

  // Вычисляем среднюю задержку
  if (latencies.length > 0) {
    stats.avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    stats.users = users;
  }

  return stats;
}

/**
 * Вывести статистику
 */
function printStats(stats: TestStats) {
  console.log(`\n\n📊 ИТОГОВАЯ СТАТИСТИКА`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`👥 Пользователи:`);
  console.log(`   Всего создано: ${stats.totalUsers}`);
  console.log(``);
  console.log(`📦 Ставки:`);
  console.log(`   Всего: ${stats.totalBets}`);
  console.log(
    `   Успешных: ${stats.successBets} (${((stats.successBets / stats.totalBets) * 100).toFixed(2)}%)`
  );
  console.log(
    `   Ошибок: ${stats.failedBets} (${((stats.failedBets / stats.totalBets) * 100).toFixed(2)}%)`
  );
  console.log(``);
  console.log(`⏱️  Задержка (latency):`);
  console.log(`   Минимальная: ${stats.minLatency === Infinity ? 'N/A' : stats.minLatency.toFixed(2)}ms`);
  console.log(`   Средняя: ${stats.avgLatency.toFixed(2)}ms`);
  console.log(`   Максимальная: ${stats.maxLatency.toFixed(2)}ms`);

  if (stats.errors.size > 0) {
    console.log(``);
    console.log(`❌ Распределение ошибок:`);
    stats.errors.forEach((count, error) => {
      console.log(
        `   ${error}: ${count} (${((count / stats.failedBets) * 100).toFixed(2)}%)`
      );
    });
  }

  // Топ пользователей по активности
  if (stats.users.length > 0) {
    const topUsers = [...stats.users]
      .sort((a, b) => b.betsCount - a.betsCount)
      .slice(0, 10);
    console.log(``);
    console.log(`🏆 Топ-10 пользователей по активности:`);
    topUsers.forEach((user, index) => {
      console.log(
        `   ${index + 1}. ${user.id.substring(0, 30)}... | Ставок: ${user.betsCount} | Успешных: ${user.successBets} | Ошибок: ${user.failedBets}`
      );
    });
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

/**
 * Главная функция
 */
async function main() {
  // Получаем все аргументы, включая те, что после --
  const args = process.argv.slice(2);

  // Отладочный вывод для проверки аргументов
  if (args.length > 0) {
    console.log('🔍 Отладка: полученные аргументы:', args);
  }

  // Функция для парсинга аргумента
  const getArg = (name: string, defaultValue: string): string => {
    // Ищем аргумент в формате --name=value или --name value
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    if (arg) {
      return arg.split('=')[1];
    }
    // Ищем аргумент в формате --name value (отдельные слова)
    const index = args.indexOf(`--${name}`);
    if (index !== -1 && args[index + 1]) {
      return args[index + 1];
    }
    return defaultValue;
  };

  // Парсинг аргументов
  const numUsers = parseInt(getArg('users', '100'));
  const balanceMin = parseInt(getArg('balance-min', '10000'));
  const balanceMax = parseInt(getArg('balance-max', '100000'));
  const betAmountMin = parseInt(getArg('bet-min', '1000'));
  const betAmountMax = parseInt(getArg('bet-max', '50000'));
  const concurrentBets = parseInt(getArg('concurrent', '50'));
  const delayBetweenBets = parseInt(getArg('delay', '100'));
  const rounds = parseInt(getArg('rounds', '5'));
  const apiUrl = getArg('api', API_URL);

  const config: LoadTestConfig = {
    numUsers,
    balanceMin,
    balanceMax,
    betAmountMin,
    betAmountMax,
    concurrentBets,
    delayBetweenBets,
    rounds,
  };

  // Отладочный вывод для проверки парсинга аргументов
  console.log('🔍 Отладка: распарсенные аргументы:', {
    numUsers,
    balanceMin,
    balanceMax,
    betAmountMin,
    betAmountMax,
    concurrentBets,
    delayBetweenBets,
    rounds,
    apiUrl,
  });
  console.log('🔍 Отладка: process.argv:', process.argv);

  try {
    const stats = await runLoadTest(config, apiUrl);
    printStats(stats);
  } catch (error: any) {
    console.error(`\n❌ Критическая ошибка:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Запуск
main().catch(console.error);
