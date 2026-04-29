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
