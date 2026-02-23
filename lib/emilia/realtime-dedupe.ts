/**
 * Sistema de deduplicación para eventos Realtime
 * Evita procesar el mismo evento múltiples veces
 */

class RealtimeEventDedupe {
  private seen = new Set<string>()
  private readonly TTL = 5000 // 5 segundos
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Limpiar cache cada 10s (solo en cliente)
    if (typeof window !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 10000)
    }
  }

  private cleanup() {
    this.seen.clear()
  }

  shouldProcess(eventId: string): boolean {
    if (this.seen.has(eventId)) {
      return false // Duplicado, skip
    }

    this.seen.add(eventId)

    // Auto-remover después de TTL
    setTimeout(() => this.seen.delete(eventId), this.TTL)

    return true
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.cleanup()
  }
}

export const realtimeDedupe = new RealtimeEventDedupe()
