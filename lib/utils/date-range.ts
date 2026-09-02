/**
 * Helpers para convertir fechas "YYYY-MM-DD" (elegidas por el usuario en
 * su UI) a timestamps con timezone explícito, para filtrar columnas
 * `TIMESTAMP WITH TIME ZONE` en Postgres sin perder movimientos por
 * desfasaje de timezone.
 *
 * Fix del bug "egresos no aparecen al filtrar por fechas en Cajas":
 *   El patrón anterior `gte("movement_date", "${dateFrom}T00:00:00")`
 *   mandaba el string SIN timezone. Postgres (servidor en UTC) lo
 *   interpretaba como UTC. Un movimiento cargado "el 13/02 a las 23h
 *   hora AR" se guarda como `2026-02-14T02:00:00Z`. Filtrando
 *   `dateTo=2026-02-13 → 2026-02-13T23:59:59 UTC` = 20:59 AR, el
 *   movimiento quedaba invisible aunque fuera del mismo día local.
 *
 * La solución es anexar el offset explícito de la zona del usuario
 * (Argentina, -03:00). Así Postgres entiende "fin del 13 hora AR" =
 * "02:59 del 14 UTC" y el rango abarca el día completo.
 *
 * NOTA: el offset está hardcodeado para Argentina. Cuando el sistema
 * soporte agencias en otras zonas (SaaS multi-tenant), habrá que leer
 * el offset desde la config de la agencia del usuario.
 */

const APP_TIMEZONE_OFFSET = "-03:00" // Argentina sin horario de verano
const AR_OFFSET_MS = -3 * 60 * 60 * 1000

/**
 * Convierte "2026-02-13" en "2026-02-13T00:00:00-03:00"
 * Listo para usar con `.gte("col", startOfDayAR(dateFrom))`.
 */
export function startOfDayAR(dateStr: string): string {
  return `${dateStr}T00:00:00${APP_TIMEZONE_OFFSET}`
}

/**
 * Convierte "2026-02-13" en "2026-02-13T23:59:59-03:00"
 * Listo para usar con `.lte("col", endOfDayAR(dateTo))`.
 */
export function endOfDayAR(dateStr: string): string {
  return `${dateStr}T23:59:59${APP_TIMEZONE_OFFSET}`
}

/**
 * El día "YYYY-MM-DD" de un valor que puede ser una fecha o un instante (VIB-178).
 *
 * Las dos funciones de arriba sirven para filtrar INSTANTES: `created_at`,
 * `paid_at`, cualquier cosa que pasó a una hora. No sirven para comparar contra
 * una columna DATE ni contra un timestamp que en realidad guarda una fecha sin
 * hora: ahí la ventana en hora argentina arranca a las 03:00Z y se saltea el
 * propio día, mientras deja entrar la medianoche del siguiente.
 *
 * Para esos casos se compara día contra día, que no tiene zona horaria:
 *
 *     if (businessDayOf(fila.departure_date) < dateFrom) continue
 *
 * Un "YYYY-MM-DD" se devuelve tal cual —es la fecha que alguien eligió— y un
 * instante real se convierte a la fecha que era en Argentina.
 */
export function businessDayOf(value: string | Date | null | undefined): string | null {
  if (!value) return null

  if (typeof value === "string") {
    // Fecha pura: ya es el día, sin nada que interpretar.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    // Timestamp que guarda una fecha sin hora (medianoche UTC): el día es el suyo.
    if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?(Z|\+00:00)$/.test(value)) return value.slice(0, 10)
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  // Instante real: el día que era en Argentina cuando ocurrió.
  const ar = new Date(date.getTime() + AR_OFFSET_MS)
  return ar.toISOString().slice(0, 10)
}
