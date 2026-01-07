import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface Round {
  _id: string;
  number: number;
  status: string;
  startTime: string;
  endTime: string;
}

interface CurrentRoundData {
  round: Round;
}

class Bot {
  private userId: string;
  private api: any;
  private balance: number = 0;
  private roundId: string | null = null;
  private endTime: Date | null = null;

  constructor(userId: string) {
    this.userId = userId;
    this.api = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
    });
  }

  async deposit(amount: number) {
    try {
      await this.api.post('/api/user/deposit', { amount });
      this.balance += amount;
      console.log(`[${this.userId}] Пополнен баланс на ${amount} руб.`);
    } catch (error: any) {
      console.error(
        `[${this.userId}] Ошибка пополнения:`,
        error.response?.data?.error || error.message
      );
    }
  }

  async getCurrentRound(): Promise<Round | null> {
    try {
      const response = await this.api.get('/api/round/current');
      const data: CurrentRoundData = response.data;
      if (data.round) {
        this.roundId = data.round._id;
        this.endTime = new Date(data.round.endTime);
        return data.round;
      }
      return null;
    } catch (error: any) {
      console.error(
        `[${this.userId}] Ошибка получения раунда:`,
        error.response?.data?.error || error.message
      );
      return null;
    }
  }

  async placeBet(amount: number): Promise<boolean> {
    if (!this.roundId) {
      console.log(`[${this.userId}] Нет активного раунда`);
      return false;
    }

    try {
      await this.api.post('/api/bet', {
        roundId: this.roundId,
        amount,
      });
      this.balance -= amount;
      console.log(`[${this.userId}] Ставка ${amount} руб. размещена`);
      return true;
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message;
      if (errorMsg.includes('Недостаточно средств')) {
        console.log(`[${this.userId}] Недостаточно средств для ставки ${amount}`);
        return false;
      }
      console.error(`[${this.userId}] Ошибка размещения ставки:`, errorMsg);
      return false;
    }
  }

  async getBalance(): Promise<number> {
    try {
      const response = await this.api.get('/api/user/me');
      this.balance = response.data.user.balance;
      return this.balance;
    } catch (error: any) {
      console.error(
        `[${this.userId}] Ошибка получения баланса:`,
        error.response?.data?.error || error.message
      );
      return 0;
    }
  }

  getTimeUntilEnd(): number {
    if (!this.endTime) return Infinity;
    return this.endTime.getTime() - new Date().getTime();
  }
}

// Основная функция запуска ботов
async function main() {
  const numBots = parseInt(process.env.NUM_BOTS || '10');
  const initialDeposit = parseInt(process.env.INITIAL_DEPOSIT || '50000');

  console.log(`🚀 Запуск ${numBots} ботов...`);
  console.log(`💰 Начальный баланс каждого бота: ${initialDeposit} руб.`);

  const bots: Bot[] = [];

  // Создать ботов
  for (let i = 0; i < numBots; i++) {
    const bot = new Bot(`bot_${i + 1}`);
    bots.push(bot);

    // Пополнить баланс
    await bot.deposit(initialDeposit);

    // Небольшая задержка между ботами
    await sleep(100);
  }

  console.log(`✅ Все боты созданы и пополнили баланс`);

  // Основной цикл работы ботов
  while (true) {
    for (const bot of bots) {
      const round = await bot.getCurrentRound();

      if (!round) {
        console.log('⏳ Ожидание активного раунда...');
        await sleep(5000);
        continue;
      }

      // Случайная ставка в диапазоне
      const minBet = 1000;
      const maxBet = 30000;
      const betAmount = Math.floor(Math.random() * (maxBet - minBet + 1)) + minBet;

      const balance = await bot.getBalance();
      if (balance < betAmount) {
        // Пополнить баланс если недостаточно
        await bot.deposit(initialDeposit);
      }

      // Разместить ставку
      await bot.placeBet(betAmount);

      // Случайная задержка перед следующей ставкой
      await sleep(Math.random() * 3000 + 1000);

      // Проверить, близко ли окончание раунда (anti-sniping тест)
      const timeUntilEnd = bot.getTimeUntilEnd();
      if (timeUntilEnd < 5000 && timeUntilEnd > 0) {
        // Последняя секунда - сделать большую ставку
        console.log(`[${bot['userId']}] ⚡ Последняя секунда! Делаю большую ставку`);
        const lastSecondBet = Math.floor(Math.random() * 20000 + 10000);
        if (balance >= lastSecondBet) {
          await bot.placeBet(lastSecondBet);
        }
      }
    }

    await sleep(2000); // Небольшая задержка между циклами
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Запуск
main().catch(console.error);
