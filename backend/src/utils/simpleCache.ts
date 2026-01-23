type CacheKey = string;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

/**
 * SimpleCache с поддержкой LRU eviction и maxSize
 * Защищает от неограниченного роста памяти
 */
export class SimpleCache<T> {
  private store = new Map<CacheKey, CacheEntry<T>>();
  private maxSize: number;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private defaultTtlMs: number,
    maxSize: number = 1000
  ) {
    this.maxSize = maxSize;
    
    // Запускаем периодическую очистку устаревших записей каждые 60 секунд
    this.cleanupIntervalId = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  get(key: CacheKey): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    const now = Date.now();
    
    if (now > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    // Обновляем время последнего доступа для LRU
    entry.lastAccessed = now;
    return entry.value;
  }

  set(key: CacheKey, value: T, ttlMs?: number): void {
    const ttl = typeof ttlMs === 'number' ? ttlMs : this.defaultTtlMs;
    const now = Date.now();
    
    // Если достигли maxSize, удаляем LRU записи
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictLRU();
    }
    
    this.store.set(key, {
      value,
      expiresAt: now + ttl,
      lastAccessed: now,
    });
  }

  delete(key: CacheKey): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /**
   * Получить текущий размер кеша
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Удалить самую старую по доступу запись (LRU eviction)
   */
  private evictLRU(): void {
    let oldestKey: CacheKey | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }

  /**
   * Очистка устаревших записей
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Остановить периодическую очистку (для корректного завершения)
   */
  destroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.store.clear();
  }
}

