/**
 * Rate Limiting Utility
 * 
 * Implementa rate limiting simple usando un Map en memoria.
 * Para producción, considerar usar Redis o un servicio dedicado.
 */

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

interface RequestRecord {
  count: number
  resetTime: number
}

// Store para rate limiting (en memoria)
// En producción, usar Redis o similar
const rateLimitStore = new Map<string, RequestRecord>()

// Limpiar registros expirados cada 5 minutos
setInterval(() => {
  const now = Date.now()
  const keysToDelete: string[] = []
  rateLimitStore.forEach((record, key) => {
    if (now > record.resetTime) {
      keysToDelete.push(key)
    }
  })
  keysToDelete.forEach(key => rateLimitStore.delete(key))
}, 5 * 60 * 1000)

/**
 * Obtener identificador único para rate limiting
 */
function getRateLimitKey(identifier: string, endpoint: string): string {
  return `${endpoint}:${identifier}`
}

/**
 * Verificar si una solicitud excede el límite de rate
 */
export function checkRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number } {
  const key = getRateLimitKey(identifier, endpoint)
  const now = Date.now()
  const record = rateLimitStore.get(key)

  // Si no hay registro o el tiempo de reset expiró, crear uno nuevo
  if (!record || now > record.resetTime) {
    const newRecord: RequestRecord = {
      count: 1,
      resetTime: now + config.windowMs,
    }
    rateLimitStore.set(key, newRecord)
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: newRecord.resetTime,
    }
  }

  // Si el límite fue excedido
  if (record.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    }
  }

  // Incrementar contador
  record.count++
  rateLimitStore.set(key, record)

  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetTime: record.resetTime,
  }
}

/**
 * Configuraciones predefinidas para diferentes endpoints
 */
export const RATE_LIMIT_CONFIGS = {
  // AI Copilot: 10 requests por minuto por usuario
  AI_COPILOT: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minuto
  },
  // Trello Webhook: 100 requests por minuto por IP
  TRELLO_WEBHOOK: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minuto
  },
  // APIs generales: 100 requests por minuto por usuario
  GENERAL: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minuto
  },
  // APIs de escritura: 30 requests por minuto por usuario
  WRITE: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minuto
  },
} as const

/**
 * Helper para usar en API routes
 */
export function withRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig
) {
  const result = checkRateLimit(identifier, endpoint, config)

  if (!result.allowed) {
    const error = new Error("Too many requests")
    ;(error as any).statusCode = 429
    ;(error as any).resetTime = result.resetTime
    throw error
  }

  return result
}

