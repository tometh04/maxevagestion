/**
 * Parsea string a número. Soporta formatos $1,234.56 (US) y 1234.56.
 * Retorna null si no se puede parsear.
 */
export function parseAmount(input: string): number | null {
  if (!input || !input.trim()) return null
  const cleaned = input.replace(/[$\s,]/g, "")
  if (!cleaned) return null
  const num = Number(cleaned)
  if (Number.isNaN(num)) return null
  return num
}

/**
 * Parsea fecha. Soporta YYYY-MM-DD y DD/MM/YYYY (incluyendo D/M/YYYY).
 * Retorna null si formato inválido.
 */
export function parseDate(input: string): Date | null {
  if (!input || !input.trim()) return null
  const trimmed = input.trim()

  // Formato ISO YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    return makeDate(+year, +month, +day)
  }

  // Formato DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch
    return makeDate(+year, +month, +day)
  }

  return null
}

function makeDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  // Construir UTC para evitar timezone shifts
  const date = new Date(Date.UTC(year, month - 1, day))
  // Verificar que no hubo overflow (ej: 2026-02-30 → 2026-03-02)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

/**
 * Normaliza currency: acepta solo ARS o USD, retorna uppercase.
 */
export function normalizeCurrency(input: string): "ARS" | "USD" | null {
  const upper = input?.toUpperCase()
  if (upper === "ARS" || upper === "USD") return upper
  return null
}

const VALID_STATUSES = [
  "RESERVED",
  "CONFIRMED",
  "CANCELLED",
  "TRAVELLING",
  "TRAVELLED",
] as const

type OperationStatus = (typeof VALID_STATUSES)[number]

/**
 * Normaliza status. Soporta migración de estados antiguos.
 */
export function normalizeStatus(input: string): OperationStatus | null {
  if (!input) return null
  const upper = input.toUpperCase()
  // Migrar estados antiguos
  if (upper === "PRE_RESERVATION") return "RESERVED"
  if (upper === "CLOSED") return "TRAVELLED"
  if ((VALID_STATUSES as readonly string[]).includes(upper)) {
    return upper as OperationStatus
  }
  return null
}
