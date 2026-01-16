import axios, { AxiosError } from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface RPSTestConfig {
  targetRPS: number; // Целевое количество запросов в секунду
  duration: number; // Длительность теста в секундах
  endpoint: string; // Эндпоинт для тестирования
  method: 'GET' | 'POST' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  warmupDuration?: number; // Время разогрева в секундах
}

interface RequestResult {
  success: boolean;
  statusCode?: number;
  latency: number; // Время ответа в мс
  error?: string;
}

interface TestStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  minLatency: number;
  maxLatency: number;
  avgLatency: number;
  p50Latency: number; // Медиана
  p95Latency: number; // 95-й перцентиль
  p99Latency: number; // 99-й перцентиль
  actualRPS: number;
  targetRPS: number;
  errors: Map<string, number>;
}

/**
 * Выполнить один запрос и измерить latency
 */
async function makeRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH',
  headers?: Record<string, string>,
  body?: any
): Promise<RequestResult> {
  const startTime = Date.now();
  try {
    const config: any = {
      method,
      url: `${API_URL}${endpoint}`,
      headers: headers || {},
      timeout: 10000,
    };

    if (body && (method === 'POST' || method === 'PATCH')) {
      config.data = body;
    }

    const response = await axios(config);
    const latency = Date.now() - startTime;

    return {
      success: true,
      statusCode: response.status,
      latency,
    };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    const axiosError = error as AxiosError;

    const errorData = axiosError.response?.data as any;
    return {
      success: false,
      statusCode: axiosError.response?.status,
      latency,
      error: errorData?.error || axiosError.message || 'Unknown error',
    };
  }
}

/**
 * Вычислить статистику из результатов
 */
function calculateStats(results: RequestResult[], targetRPS: number, duration: number): TestStats {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const latencies = results.map((r) => r.latency).sort((a, b) => a - b);

  const errors = new Map<string, number>();
  failed.forEach((r) => {
    const errorKey = r.error || `HTTP ${r.statusCode || 'Unknown'}`;
    errors.set(errorKey, (errors.get(errorKey) || 0) + 1);
  });

  const avgLatency =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p50Index = Math.floor(latencies.length * 0.5);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p99Index = Math.floor(latencies.length * 0.99);

  const actualRPS = results.length / duration;

  return {
    totalRequests: results.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    minLatency: latencies[0] || 0,
    maxLatency: latencies[latencies.length - 1] || 0,
    avgLatency,
    p50Latency: latencies[p50Index] || 0,
    p95Latency: latencies[p95Index] || 0,
    p99Latency: latencies[p99Index] || 0,
    actualRPS,
    targetRPS,
    errors,
  };
}

/**
 * Выполнить RPS тест
 */
async function runRPSTest(config: RPSTestConfig): Promise<TestStats> {
  console.log(`\n🚀 Запуск RPS теста:`);
  console.log(`   Эндпоинт: ${config.method} ${config.endpoint}`);
  console.log(`   Целевой RPS: ${config.targetRPS}`);
  console.log(`   Длительность: ${config.duration}с`);
  if (config.warmupDuration) {
    console.log(`   Разогрев: ${config.warmupDuration}с`);
  }
  console.log('');

  const results: RequestResult[] = [];
  const startTime = Date.now();

  // Разогрев (если указан)
  if (config.warmupDuration) {
    console.log(`🔥 Разогрев...`);
    const warmupStart = Date.now();
    const warmupEnd = warmupStart + config.warmupDuration * 1000;
    const warmupRPS = Math.min(config.targetRPS, 10); // Меньший RPS для разогрева
    const warmupInterval = 1000 / warmupRPS;

    while (Date.now() < warmupEnd) {
      await makeRequest(config.endpoint, config.method, config.headers, config.body);
      await new Promise((resolve) => setTimeout(resolve, warmupInterval));
    }
    console.log(`✅ Разогрев завершен\n`);
  }

  // Основной тест
  console.log(`⏱️  Тест запущен...`);
  const testEndTime = startTime + config.duration * 1000;

  // Определяем количество потоков и RPS на поток
  // Для высокого RPS используем несколько потоков
  const maxRPSPerThread = 100; // Максимум RPS на один поток
  const numThreads = Math.max(1, Math.ceil(config.targetRPS / maxRPSPerThread));
  const rpsPerThread = config.targetRPS / numThreads;
  const intervalPerThread = 1000 / rpsPerThread;

  console.log(`   Потоков: ${numThreads}, RPS на поток: ${rpsPerThread.toFixed(2)}\n`);

  // Функция для отправки запросов с нужной частотой (для одного потока)
  const sendRequest = async () => {
    while (Date.now() < testEndTime) {
      const requestStart = Date.now();
      const result = await makeRequest(config.endpoint, config.method, config.headers, config.body);
      results.push(result);

      // Подождать до следующего запроса
      const elapsed = Date.now() - requestStart;
      const waitTime = Math.max(0, intervalPerThread - elapsed);
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  };

  // Запускаем потоки
  const threads = Array(numThreads)
    .fill(null)
    .map(() => sendRequest());

  await Promise.all(threads);

  const actualDuration = (Date.now() - startTime) / 1000;
  const stats = calculateStats(results, config.targetRPS, actualDuration);

  return stats;
}

/**
 * Вывести статистику в красивом формате
 */
function printStats(stats: TestStats) {
  console.log(`\n📊 РЕЗУЛЬТАТЫ ТЕСТА:`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📈 Производительность:`);
  console.log(`   Целевой RPS:     ${stats.targetRPS.toFixed(2)}`);
  console.log(`   Фактический RPS: ${stats.actualRPS.toFixed(2)}`);
  console.log(`   Отклонение:      ${((stats.actualRPS / stats.targetRPS) * 100).toFixed(1)}%`);
  console.log(``);
  console.log(`📦 Запросы:`);
  console.log(`   Всего:           ${stats.totalRequests}`);
  console.log(
    `   Успешных:        ${stats.successfulRequests} (${(
      (stats.successfulRequests / stats.totalRequests) *
      100
    ).toFixed(2)}%)`
  );
  console.log(
    `   Ошибок:          ${stats.failedRequests} (${(
      (stats.failedRequests / stats.totalRequests) *
      100
    ).toFixed(2)}%)`
  );
  console.log(``);
  console.log(`⏱️  Задержка (latency):`);
  console.log(`   Минимальная:     ${stats.minLatency.toFixed(2)}ms`);
  console.log(`   Средняя:         ${stats.avgLatency.toFixed(2)}ms`);
  console.log(`   Медиана (p50):   ${stats.p50Latency.toFixed(2)}ms`);
  console.log(`   p95:             ${stats.p95Latency.toFixed(2)}ms`);
  console.log(`   p99:             ${stats.p99Latency.toFixed(2)}ms`);
  console.log(`   Максимальная:    ${stats.maxLatency.toFixed(2)}ms`);

  if (stats.errors.size > 0) {
    console.log(``);
    console.log(`❌ Ошибки:`);
    stats.errors.forEach((count, error) => {
      console.log(`   ${error}: ${count} (${((count / stats.failedRequests) * 100).toFixed(2)}%)`);
    });
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

/**
 * Основная функция для запуска тестов
 */
async function main() {
  const args = process.argv.slice(2);

  // Парсинг аргументов командной строки
  const endpoint =
    args.find((a) => a.startsWith('--endpoint='))?.split('=')[1] || '/api/auction/current';
  const method = (
    args.find((a) => a.startsWith('--method='))?.split('=')[1] || 'GET'
  ).toUpperCase() as 'GET' | 'POST' | 'PATCH';
  const rps = parseInt(args.find((a) => a.startsWith('--rps='))?.split('=')[1] || '100');
  const duration = parseInt(args.find((a) => a.startsWith('--duration='))?.split('=')[1] || '30');
  const warmup = parseInt(args.find((a) => a.startsWith('--warmup='))?.split('=')[1] || '5');
  const userId = args.find((a) => a.startsWith('--user='))?.split('=')[1] || 'rps_test_user';

  console.log(`╔════════════════════════════════════════════════════════╗`);
  console.log(`║          RPS ТЕСТ ПРОИЗВОДИТЕЛЬНОСТИ API               ║`);
  console.log(`╚════════════════════════════════════════════════════════╝`);

  // По умолчанию обходим rate limiting для RPS тестов (можно отключить через --no-bypass-ratelimit)
  const bypassRateLimit = args.find((a) => a === '--no-bypass-ratelimit') === undefined;

  const config: RPSTestConfig = {
    targetRPS: rps,
    duration,
    endpoint,
    method,
    headers: {
      'X-User-Id': userId,
      'Content-Type': 'application/json',
      ...(bypassRateLimit && { 'X-Bypass-RateLimit': 'true' }),
    },
    warmupDuration: warmup,
  };

  if (bypassRateLimit) {
    console.log(`   ⚠️  Rate limiting обойден для тестирования\n`);
  }

  // Если это POST/PATCH, добавляем тело запроса
  if (method === 'POST' && endpoint.includes('/bet')) {
    // Для ставок нужен roundId
    try {
      const roundResponse = await axios.get(`${API_URL}/api/round/current`, {
        headers: { 'X-User-Id': userId },
      });
      if (roundResponse.data.round) {
        config.body = {
          roundId: roundResponse.data.round._id,
          amount: 1000,
        };
      }
    } catch (error) {
      console.error('⚠️  Не удалось получить roundId для теста ставок');
    }
  }

  try {
    const stats = await runRPSTest(config);
    printStats(stats);
  } catch (error: any) {
    console.error('❌ Ошибка выполнения теста:', error.message);
    process.exit(1);
  }
}

// Запуск
main().catch(console.error);
