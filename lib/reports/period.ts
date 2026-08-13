/**
 * Helpers de período compartidos por los reportes.
 *
 * Todo lo temporal de los reportes se calcula en hora Argentina y comparando
 * strings `YYYY-MM-DD`, nunca objetos `Date`: ahí es donde nacen los off-by-one
 * (un gasto cargado 23:30 cayendo al día siguiente, un vencimiento de hoy
 * apareciendo como vencido).
 */

const AR_OFFSET_MS = 3 * 60 * 60 * 1000 // -03:00

export const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

/** Fecha calendario en hora Argentina, independiente del TZ del servidor. */
export function toArgentinaDateKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const shifted = new Date(d.getTime() - AR_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Días calendario inclusive entre dos fechas YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  return Math.floor((b - a) / 86400000) + 1
}

/** Días de diferencia con signo: negativo si `to` es anterior a `from`. */
export function daysDiff(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86400000)
}

export function addDays(dateKey: string, amount: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + amount)
  return d.toISOString().slice(0, 10)
}

/** "2026-07-14" → "14/07". */
export function dayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-")
  return `${d}/${m}`
}

/** "2026-07" → "Jul 26". */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-")
  return `${MONTH_LABELS[Number(m) - 1] ?? m} ${y.slice(2)}`
}

export function nextMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number)
  const nm = m === 12 ? 1 : m + 1
  const ny = m === 12 ? y + 1 : y
  return `${ny}-${String(nm).padStart(2, "0")}`
}

/**
 * Lista de meses "YYYY-MM" entre dos fechas, ambos inclusive. Se usa para
 * rellenar los huecos: un mes sin movimientos tiene que aparecer en cero, no
 * desaparecer del gráfico.
 */
export function monthKeysBetween(dateFrom: string, dateTo: string): string[] {
  if (!dateFrom || !dateTo) return []
  const keys: string[] = []
  for (let k = dateFrom.slice(0, 7); k <= dateTo.slice(0, 7); k = nextMonth(k)) {
    keys.push(k)
    if (keys.length > 600) break // guarda contra rangos absurdos
  }
  return keys
}

export function safeDiv(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}
