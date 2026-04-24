/**
 * In-memory cache con TTL para cotizaciones oficiales de AFIP.
 * Vive el proceso Node — Railway tiene 1 replica activa así que es
 * suficiente. Si en el futuro escalamos horizontal, migrar a Upstash.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class RateCache<T = number> {
  private store: Map<string, CacheEntry<T>> = new Map()

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    })
  }

  clear(): void {
    this.store.clear()
  }
}

// Singleton global: 1 instance para cotizaciones AFIP con TTL 1h.
export const afipRateCache = new RateCache<number>(60 * 60 * 1000)
