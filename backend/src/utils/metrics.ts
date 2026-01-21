let betsTotal = 0;
let betsFailed = 0;

export function recordBetSuccess(): void {
  betsTotal += 1;
}

export function recordBetFailure(): void {
  betsTotal += 1;
  betsFailed += 1;
}

export function getMetricsSnapshot() {
  return {
    bets: {
      total: betsTotal,
      failed: betsFailed,
    },
  };
}

