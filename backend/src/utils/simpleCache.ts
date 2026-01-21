type CacheKey = string;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class SimpleCache<T> {
  private store = new Map<CacheKey, CacheEntry<T>>();

  constructor(private defaultTtlMs: number) {}

  get(key: CacheKey): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: CacheKey, value: T, ttlMs?: number): void {
    const ttl = typeof ttlMs === 'number' ? ttlMs : this.defaultTtlMs;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  delete(key: CacheKey): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

