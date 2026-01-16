# RPS Тесты производительности

Инструмент для нагрузочного тестирования API и измерения производительности в запросах в секунду (RPS).

## Использование

### Базовый запуск

```bash
npm run rps
```

По умолчанию:
- Эндпоинт: `GET /api/auction/current`
- RPS: 100 запросов/сек
- Длительность: 30 секунд
- Разогрев: 5 секунд

### Параметры командной строки

```bash
npm run rps -- --endpoint=/api/auction/current --rps=200 --duration=60 --warmup=10
```

**Параметры:**
- `--endpoint=<path>` - эндпоинт для тестирования (по умолчанию: `/api/auction/current`)
- `--method=<GET|POST|PATCH>` - HTTP метод (по умолчанию: `GET`)
- `--rps=<number>` - целевое количество запросов в секунду (по умолчанию: `100`)
- `--duration=<seconds>` - длительность теста в секундах (по умолчанию: `30`)
- `--warmup=<seconds>` - время разогрева в секундах (по умолчанию: `5`)
- `--user=<userId>` - ID пользователя для заголовка X-User-Id (по умолчанию: `rps_test_user`)
- `--no-bypass-ratelimit` - отключить обход rate limiting (по умолчанию rate limiting обходится для тестов в development режиме)

## Примеры

### Тест получения текущего аукциона

```bash
npm run rps -- --endpoint=/api/auction/current --rps=500 --duration=60
```

### Тест получения всех аукционов

```bash
npm run rps -- --endpoint=/api/auction/all --rps=100 --duration=30
```

### Тест получения текущего раунда

```bash
npm run rps -- --endpoint=/api/round/current --rps=300 --duration=45
```

### Тест создания ставки (POST)

```bash
npm run rps -- --endpoint=/api/bet --method=POST --rps=50 --duration=30
```

**Примечание:** Для POST запросов на `/api/bet` скрипт автоматически получит активный roundId.

### Тест статистики

```bash
npm run rps -- --endpoint=/api/stats --rps=200 --duration=60
```

## Результаты

Тест выводит подробную статистику:

- **Производительность:**
  - Целевой и фактический RPS
  - Процент отклонения от цели

- **Запросы:**
  - Общее количество
  - Успешные и неуспешные (с процентами)

- **Задержка (latency):**
  - Минимальная, средняя, максимальная
  - Медиана (p50)
  - 95-й перцентиль (p95)
  - 99-й перцентиль (p99)

- **Ошибки:**
  - Типы ошибок и их количество

## Переменные окружения

- `API_URL` - URL API сервера (по умолчанию: `http://localhost:3000`)

Пример:
```bash
API_URL=http://localhost:3000 npm run rps -- --rps=500
```
