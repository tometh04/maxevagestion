/**
 * Sobre qué fecha filtra la pantalla de Comisiones.
 *
 * Bug 2026-08-11 (reporte de Yamil, Lozada): filtrar "julio" para liquidarle las
 * comisiones a los vendedores devolvía las ventas equivocadas. La pantalla
 * filtraba por `commission_records.date_calculated`, y esa columna la reescribe
 * `applyCommissionPlan()` con la fecha de hoy en CADA recálculo: recalcular
 * comisiones desde la UI, editar la operación, o correr un script de corrección
 * masiva. Después del recálculo de agosto, 188 de las 204 comisiones pendientes
 * de ventas de julio habían quedado estampadas en agosto: julio devolvía 61
 * comisiones (casi todas de febrero a junio) y agosto devolvía 256.
 *
 * `date_calculated` responde "cuándo corrió el cálculo", que no es una pregunta
 * que se le haga a esta pantalla. Las dos que sí se hacen:
 *
 *   - "qué vendió cada uno en julio" → `operations.operation_date`, la fecha de
 *     la venta, que no reescribe nadie. Es el mismo criterio que ya usa el
 *     Reporte de Comisiones (VIB-65).
 *   - "cuánto le pagué a los vendedores en julio" → `date_paid`.
 *
 * Este módulo elige la columna y arma el rango; la route solo lo aplica.
 */

/** `sale` = mes de la venta (default). `paid` = mes de la liquidación. */
export type CommissionDateBasis = "sale" | "paid"

export interface CommissionDateFilterInput {
  /** Mes en formato "YYYY-MM". */
  month?: string | null
  /** Fecha "YYYY-MM-DD" inclusive. Se combina con `month` si vienen las dos. */
  periodStart?: string | null
  /** Fecha "YYYY-MM-DD" inclusive. */
  periodEnd?: string | null
  basis?: CommissionDateBasis | null
}

export interface CommissionDateFilter {
  /** Columna a filtrar, en sintaxis PostgREST (puede ser del embed). */
  column: string
  /** Cotas inclusive, o null si no corresponde filtrar por ese lado. */
  from: string | null
  to: string | null
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function normalizeDateBasis(raw: string | null | undefined): CommissionDateBasis {
  return raw === "paid" ? "paid" : "sale"
}

export function commissionDateColumn(basis: CommissionDateBasis): string {
  return basis === "paid" ? "date_paid" : "operations.operation_date"
}

/**
 * Último día del mes, con aritmética en UTC.
 *
 * `new Date(y, m, 0).toISOString()` —lo que había antes— arma la fecha en la
 * zona del servidor y la imprime en UTC: con offset positivo el día 31 se
 * convertía en el 30 y quedaba fuera del filtro. En Railway (UTC) no se notaba.
 */
export function lastDayOfMonth(month: string): string {
  const [year, monthNum] = month.split("-")
  const day = new Date(Date.UTC(Number(year), Number(monthNum), 0)).getUTCDate()
  return `${year}-${monthNum}-${String(day).padStart(2, "0")}`
}

/**
 * Devuelve la columna y el rango a aplicar. `month` fija el mes completo;
 * `periodStart`/`periodEnd` recortan dentro de él si vienen juntos, y valen por
 * sí solos si no hay mes. Un `month` con formato inválido se ignora en vez de
 * romper el listado: es un query param, no un dato de negocio.
 */
export function resolveCommissionDateFilter(
  input: CommissionDateFilterInput
): CommissionDateFilter {
  const basis = normalizeDateBasis(input.basis)
  const column = commissionDateColumn(basis)

  let from: string | null = null
  let to: string | null = null

  const month = input.month?.trim()
  if (month && MONTH_RE.test(month)) {
    from = `${month}-01`
    to = lastDayOfMonth(month)
  }

  // El rango explícito nunca amplía el mes elegido: se queda con la cota más
  // restrictiva de cada lado. Antes se pisaban entre sí y "julio + desde el 15"
  // podía terminar devolviendo junio.
  const periodStart = input.periodStart?.trim()
  if (periodStart) from = from && from > periodStart ? from : periodStart

  const periodEnd = input.periodEnd?.trim()
  if (periodEnd) to = to && to < periodEnd ? to : periodEnd

  return { column, from, to }
}
