/**
 * Parsea string a número. Soporta formato US ($1,234.56) y AR (1.234,56).
 * Detección: si la última coma está después del último punto → posible AR; si no → US.
 * Retorna null si no se puede parsear.
 */
export function parseAmount(input: string): number | null {
  if (!input || !input.trim()) return null
  let cleaned = input.replace(/[$\s]/g, "")
  if (!cleaned) return null

  const lastDot = cleaned.lastIndexOf(".")
  const lastComma = cleaned.lastIndexOf(",")

  if (lastComma > lastDot) {
    // Comma is after the last dot (or no dot exists).
    // Determine if this comma is an AR decimal separator or a US thousands separator.
    // A US thousands separator always leaves exactly 3 digits after the comma with no decimal.
    // An AR decimal separator leaves 1 or 2 digits after the comma (cents).
    const afterComma = cleaned.slice(lastComma + 1)
    if (lastDot === -1 && afterComma.length === 3 && !afterComma.includes(",")) {
      // Looks like US thousands: e.g. "13,680" or "1,234,567"
      cleaned = cleaned.replace(/,/g, "")
    } else {
      // AR format: dots are thousand separators, comma is decimal
      cleaned = cleaned.replace(/\./g, "").replace(",", ".")
    }
  } else {
    // US format: commas are thousand separators
    cleaned = cleaned.replace(/,/g, "")
  }

  if (!cleaned) return null
  const num = Number(cleaned)
  if (Number.isNaN(num)) return null
  return num
}

/**
 * Parsea fecha. Soporta YYYY-MM-DD, DD/MM/YYYY y DD/MM/YY (2-digit year).
 * Años 00-49 → 2000-2049. Años 50-99 → 1950-1999.
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

  // Formato DD/MM/YYYY o DD/MM/YY
  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (dmyMatch) {
    const [, day, month, yearRaw] = dmyMatch
    let year = +yearRaw
    if (yearRaw.length === 2) {
      year = year >= 50 ? 1900 + year : 2000 + year
    }
    return makeDate(year, +month, +day)
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
