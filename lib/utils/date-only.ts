/**
 * Helpers para fechas tipo DATE de Postgres (sin componente horario ni timezone).
 *
 * Problema que resuelven:
 *   Postgres serializa una columna `DATE` como el string "YYYY-MM-DD".
 *   En JavaScript, `new Date("2026-06-08")` interpreta ese string como
 *   medianoche UTC (`2026-06-08T00:00:00.000Z`). Al renderear en un
 *   timezone con offset negativo (Argentina UTC-3, ej.), eso es
 *   `2026-06-07T21:00:00-03:00` → la fecha mostrada es el DÍA ANTERIOR.
 *
 *   Bug reportado por VICO 2026-05-21: al abrir "Editar operación", los
 *   campos `departure_date` / `return_date` aparecían con un día menos
 *   que lo cargado, generando confusión y "correcciones" que terminaban
 *   guardando un día de más.
 *
 *   Fix: parsear el componente Y/M/D y construir una `Date` con el
 *   constructor LOCAL `new Date(year, monthIndex, day)`. Esa Date está
 *   anclada en la zona del browser, sin shift de timezone.
 */

/**
 * Parsea "YYYY-MM-DD" (o "YYYY-MM-DDTHH:..." truncando) a una Date
 * anclada en la zona local del navegador. Retorna undefined si la
 * entrada es null/undefined/vacía/mal formada.
 *
 * Ejemplos en zona Argentina (UTC-3):
 *   parseDateOnlyLocal("2026-06-08")           → Mon Jun 08 2026 00:00:00 GMT-0300
 *   parseDateOnlyLocal("2026-06-08T00:00:00Z") → Mon Jun 08 2026 00:00:00 GMT-0300
 *   parseDateOnlyLocal(null)                   → undefined
 */
export function parseDateOnlyLocal(
  input: string | Date | null | undefined
): Date | undefined {
  if (!input) return undefined
  if (input instanceof Date) return isNaN(input.getTime()) ? undefined : input

  const s = String(input).trim()
  if (!s) return undefined

  // "2026-06-08" o "2026-06-08T00:00:00..." — tomamos solo la parte fecha
  const datePart = s.split("T")[0]
  const m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined

  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])

  // Validación liviana (no chequea Feb 30 etc, pero descarta strings raros)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return undefined
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined

  return new Date(y, mo - 1, d)
}

/**
 * Formatea una Date a string "YYYY-MM-DD" usando los getters locales
 * (NO toISOString, que vuelve a UTC y revierte el shift).
 *
 * Usar al enviar fechas al backend (campos DATE) cuando se quiere
 * preservar la fecha que el user vio.
 */
export function formatDateOnlyLocal(d: Date | null | undefined): string | null {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
