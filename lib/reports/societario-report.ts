/**
 * Agregación del Reporte Societario (VIB-101).
 *
 * Función pura: recibe ventas, gastos, comisiones y socios ya leídos, y devuelve
 * el resultado del período y su reparto entre los socios.
 *
 * La cadena es:
 *
 *     Ventas − costo operador          = GANANCIA BRUTA
 *     bruta  − IVA sobre el margen     = margen neto de IVA
 *            − comisiones − gastos
 *            ± resultado financiero    = GANANCIA NETA A REPARTIR
 *
 * Restar es conmutativo, así que el orden no cambia el resultado: cambia qué
 * subtotal se muestra. `margenNetoIva` está a propósito justo encima de la fila
 * de comisiones porque es la base que VIB-95 quiere usar para calcularlas, y
 * hoy NO se usa: las comisiones de `commission_records` están calculadas sobre
 * la ganancia bruta. Dejar el subtotal a la vista hace que esa inconsistencia se
 * lea en pantalla en vez de quedar escondida en un ticket.
 *
 * Reglas:
 *  - La alícuota de IVA es un PARÁMETRO del reporte, no un dato del sistema: no
 *    existe alícuota por operación (`lib/accounting/iva.ts` la infiere del tipo
 *    de servicio y hoy siempre cae en 21%). Por eso viaja en el payload y se
 *    imprime en el PDF.
 *  - La base del IVA es la suma de los márgenes POSITIVOS operación por
 *    operación. Una operación con pérdida no genera débito fiscal contra el cual
 *    netear, y `max(0, Σ)` dejaría que una pérdida grande borre el IVA de las
 *    que sí ganaron.
 *  - Nada se descarta en silencio: lo que no se puede convertir sale en
 *    `missingRate`, lo truncado y lo excluido salen como warnings.
 *  - La ganancia neta puede ser negativa. No se clampea: un mes con pérdida es
 *    información, y mostrarlo en cero lo haría parecer un empate.
 *  - El resultado financiero (bonificación por depósito menos comisión de la
 *    financiera) va en su propia línea y NO dentro de gastos operativos. Es
 *    plata de operar con una financiera, no de hacer funcionar la agencia:
 *    mezclarla con alquiler y sueldos hacía que un costo de transferencia
 *    pareciera un gasto de oficina. La línea puede sumar o restar según cómo
 *    haya cerrado el neteo del período.
 */

import { roundMoney } from "@/lib/currency"
import type { FinancialResultRow } from "@/lib/accounting/fetch-financial-results"
import type { ExpenseRow } from "@/lib/expenses/fetch-expenses"
import type { CommissionRecordRow } from "@/lib/commissions/fetch-commission-records"
import type { ReferralCommissionRow } from "@/lib/commissions/fetch-referral-commissions"
import type { SalesOperationRow } from "@/lib/operations/fetch-sales-operations"
import type { PartnerAllocationRow, OrgPartner } from "@/lib/partners/fetch-partner-accounts"
import { convertExpensesTo, EXPENSE_CATEGORY_PALETTE, UNCATEGORIZED_LABEL } from "@/lib/reports/expenses-report"
import { createMoneyConverter, type ReportMissingRate } from "@/lib/reports/fx"
import { seriesColor } from "@/lib/reports/palette"
import { monthKeysBetween, monthLabel, safeDiv, toArgentinaDateKey } from "@/lib/reports/period"

/**
 * Tolerancia del margen guardado contra el recalculado, en unidades de la
 * moneda de la operación.
 *
 * Es el mismo umbral que `lib/commissions/calculate.ts`, y es a propósito: las
 * comisiones se calcularon sobre ESE número. Si el reporte usara el margen
 * guardado cuando el motor usó el recalculado, `comisiones / gananciaBruta`
 * mentiría. El umbral es adimensional (1 peso vs 1 dólar): no se "arregla" acá
 * de un lado solo, porque desincronizaría el reporte del motor.
 */
const MARGIN_DRIFT_TOLERANCE = 1

/**
 * Un ajuste de liquidación de operador (VIB-174), visto por el societario.
 *
 * Solo entra la parte de COSTO: el reparto con el vendedor viaja por
 * `commissionRecords` y ya se cuenta en la línea "Comisiones".
 */
export interface OperatorAdjustmentInput {
  /** actual − estimado. Positivo = el operador cobró más = pérdida. */
  deltaAmount: number
  currency: string
  /** Fecha de imputación: el mes en que se conoció la diferencia. */
  accrualDate: string
  agencyId: string | null
}

/** Diferencia aceptable al validar que las participaciones sumen 100. */
const PERCENTAGE_TOLERANCE = 0.01

/**
 * Cómo se calcula el IVA que se le descuenta a la venta bruta.
 *
 * `MARGEN` es el débito fiscal real de una agencia de intermediación (RG 3166),
 * el mismo que ya usa la cascada. `VENTA` trata la venta como IVA incluido, que
 * es como se pide en un estado de resultados por cuenta propia. La diferencia
 * no es cosmética: con 10,5% sobre ventas reales de Lozada, el segundo criterio
 * da un IVA diez veces mayor. Por eso es un parámetro explícito del informe y
 * se imprime en el PDF, en vez de que el número aparezca sin decir de dónde sale.
 */
export type NetoIvaCriterio = "MARGEN" | "VENTA"

export type SocietarioWarningCode =
  | "PERCENTAGES_NOT_100"
  | "NO_PARTNERS"
  | "COMMISSION_LIKE_EXPENSES"
  | "TAX_LIKE_EXPENSES"
  | "FINANCIAL_LIKE_EXPENSES"
  | "MISSING_RATE"
  | "TRUNCATED"
  | "ALLOCATIONS_PARTIAL"
  | "MARGIN_RECALCULATED"
  | "NEGATIVE_RESULT"
  | "NETO_IVA_CRITERIO_VENTA"

export interface SocietarioWarning {
  code: SocietarioWarningCode
  message: string
  /** Severidad para la UI: "warning" avisa, "danger" invalida el número. */
  level: "warning" | "danger"
}

export interface SocietarioMonthRow {
  key: string
  label: string
  ventas: number
  margen: number
  count: number
}

export interface SocietarioCategoryRow {
  category: string
  color: string
  total: number
  count: number
  share: number
}

export interface SocietarioPartnerRow {
  partnerId: string
  name: string
  percentage: number
  amount: number
  color: string
}

export interface SocietarioAllocationRow {
  partnerId: string
  name: string
  allocated: number
  computed: number
  /** null cuando el período no cubre meses completos: no son comparables. */
  difference: number | null
}

/**
 * Componente de una línea de la cascada.
 *
 * El importe lleva el MISMO signo que la línea que lo contiene: los hijos de
 * una deducción son negativos. Así la suma de los hijos da el importe del
 * padre y el lector puede verificarlo a ojo, que es todo el punto del desglose.
 */
export interface SocietarioBreakdownRow {
  key: string
  label: string
  amount: number
  /** Dato secundario: cantidad de operaciones, % del total, etc. */
  hint?: string
  /** Segundo nivel: vendedores dentro de "Vendedores", categorías en gastos. */
  children?: SocietarioBreakdownRow[]
}

export interface SocietarioWaterfallStep {
  key: string
  label: string
  amount: number
  /**
   * "adjustment" es una línea de signo variable: el resultado financiero suma
   * si la financiera dejó ganancia neta y resta si dejó pérdida. Llamarla
   * "deduction" mentiría la mitad de las veces.
   */
  kind: "base" | "deduction" | "subtotal" | "result" | "adjustment"
  /** Componentes de la línea. Los subtotales y el resultado no lo llevan. */
  breakdown?: SocietarioBreakdownRow[]
}

/**
 * Una oficina en el cierre del mes.
 *
 * `kind` distingue las oficinas reales de las dos filas residuales, que no son
 * lo mismo: `SIN_OFICINA` son ventas o comisiones cuya operación no tiene
 * oficina cargada (dato faltante), y `SIN_ASIGNAR` son gastos sin oficina, que
 * pueden ser costos compartidos legítimos o pendientes de clasificar.
 */
export interface SocietarioAgencyRow {
  key: string
  agencyId: string | null
  name: string
  kind: "AGENCY" | "SIN_OFICINA" | "SIN_ASIGNAR" | "TOTAL"
  operaciones: number
  ventaBruta: number
  /** Suma de los márgenes positivos de esta oficina. */
  ivaBase: number
  iva: number
  ventaNeta: number
  costoOperador: number
  gananciaBruta: number
  comisionesVendedores: number
  comisionesReferidores: number
  comisiones: number
  gastos: number
}

export interface SocietarioReport {
  currency: string
  dateFrom: string
  dateTo: string
  conversion: { mode: "daily" | "fixed" | "none"; rate: number | null }

  ventas: {
    count: number
    total: number
    cost: number
    margin: number
    averageTicket: number
    marginPct: number
    includeServices: boolean
    /** Operaciones cuyo margen guardado estaba desactualizado. */
    marginRecalculated: number
    truncated: boolean
    missingRate: ReportMissingRate[]
    byMonth: SocietarioMonthRow[]
  }

  gastos: {
    total: number
    count: number
    recurring: number
    variable: number
    byCategory: SocietarioCategoryRow[]
    /** Movimientos turísticos excluidos (ya descontados del margen). */
    excludedTouristic: number
    missingRate: ReportMissingRate[]
  }

  /**
   * Resultado de operar con una financiera. No es parte de `gastos`: es plata
   * que entra y sale por la forma de pagar, no por hacer funcionar la agencia.
   */
  financiero: {
    /** Bonificación por depósito del período, en positivo. */
    ingresos: number
    /** Comisión de la financiera del período, en positivo. */
    costos: number
    /** ingresos − costos. Firmado: puede ser positivo o negativo. */
    neto: number
    count: number
    countIngresos: number
    countCostos: number
    truncated: boolean
    missingRate: ReportMissingRate[]
  }

  comisiones: {
    total: number
    sellers: { total: number; count: number }
    referrals: { total: number; count: number }
    /** Base real del cálculo. VIB-95 va a mover esto a "NET_MARGIN". */
    base: "GROSS_MARGIN"
    baseLabel: string
    /** total / gananciaBruta × 100. */
    effectiveRate: number
    excluded: { settled: number; cancelled: number }
    truncated: boolean
    missingRate: ReportMissingRate[]
  }

  /**
   * Venta bruta menos IVA. Es una cifra INFORMATIVA, deliberadamente fuera de
   * la cascada: el criterio `VENTA` calcula el débito bruto sin netear el
   * crédito fiscal del costo del operador, así que meterlo en la cascada
   * cambiaría cuánta plata le toca a cada socio según un selector de pantalla.
   * La ganancia a repartir sigue usando el IVA sobre el margen en los dos modos.
   */
  ventaNeta: {
    criterio: NetoIvaCriterio
    /** Fracción (0.105 = 10,5%). */
    ivaRate: number
    bruta: number
    iva: number
    neta: number
  }

  /**
   * Las cuatro cifras del cierre abiertas por oficina, más el total.
   *
   * Llega hasta la ganancia bruta y no más: los gastos sin oficina no son
   * atribuibles y los movimientos financieros no registran oficina, así que una
   * ganancia neta por sucursal no sumaría al total ni se podría auditar.
   */
  porAgencia: {
    criterio: NetoIvaCriterio
    rows: SocietarioAgencyRow[]
    total: SocietarioAgencyRow
  }

  resultado: {
    ventas: number
    costoOperador: number
    gananciaBruta: number
    /** Fracción (0.105 = 10,5%). */
    ivaRate: number
    /** Suma de los márgenes positivos: sobre esto se aplica la alícuota. */
    ivaBase: number
    iva: number
    margenNetoIva: number
    comisiones: number
    gastos: number
    /** Firmado: suma a la ganancia neta si es positivo, resta si es negativo. */
    resultadoFinanciero: number
    gananciaNeta: number
    /** Ganancia neta sobre facturación, 0-100. */
    netMarginPct: number
    waterfall: SocietarioWaterfallStep[]
  }

  socios: {
    percentageSum: number
    percentageValid: boolean
    /** Parte de la ganancia que no le tocó a nadie (suma < 100). */
    unassignedAmount: number
    rows: SocietarioPartnerRow[]
  }

  allocations: {
    /** El período cubre meses calendario completos. */
    coversPeriod: boolean
    monthsInPeriod: number
    monthsWithAllocation: number
    total: number
    rows: SocietarioAllocationRow[]
  } | null

  warnings: SocietarioWarning[]
}

export interface BuildSocietarioReportParams {
  // ── ventas
  operations: SalesOperationRow[]
  serviceExtras?: Record<string, { saleExtra: number; costExtra: number }>
  includeServices?: boolean
  salesTruncated?: boolean
  // ── gastos (ya vienen sin turísticos desde la capa de datos)
  expenses: ExpenseRow[]
  excludedTouristicCount?: number
  // ── resultado financiero (ganancia por depósito y comisión de la financiera)
  financialMovements?: FinancialResultRow[]
  financialTruncated?: boolean
  /** El dataset de gastos vino incompleto (tope de paginado o lectura fallida). */
  expensesTruncated?: boolean
  // ── comisiones
  commissionRecords: CommissionRecordRow[]
  referralCommissions: ReferralCommissionRow[]
  commissionsExcluded?: { settled: number; cancelled: number }
  commissionsTruncated?: boolean
  // ── ajustes de liquidación de operador (VIB-174)
  //
  // El costo del operador que trae `operations` es el ESTIMADO con el que se
  // vendió; cuando la liquidación definitiva llega por otro monto, la diferencia
  // se imputa al mes en que llegó y vive en `operator_cost_adjustments`.
  //
  // Sin esta línea el reporte quedaría a mitad de camino: las comisiones de
  // corrección YA entran solas a la línea "Comisiones" (fetch-commission-records
  // no filtra por kind), así que el mes mostraría el reparto con el vendedor
  // pero no la diferencia de costo que lo originó.
  operatorAdjustments?: OperatorAdjustmentInput[]
  // ── socios
  partners: OrgPartner[]
  allocations?: PartnerAllocationRow[]
  // ── nombres para el desglose (id → nombre). Sin ellos, el desglose sale con
  //    etiquetas genéricas en vez de romper.
  agencyNames?: Map<string, string>
  sellerNames?: Map<string, string>
  referralPartnerNames?: Map<string, string>
  // ── parámetros
  /** Moneda de SALIDA. */
  currency: string
  /** Fracción: 0.105 = 10,5%. */
  ivaRate: number
  /** Base del IVA para la venta neta. Default `"MARGEN"`. */
  netoIvaCriterio?: NetoIvaCriterio
  dateFrom: string
  dateTo: string
  getRate?: (date: string | Date) => number | null
  fixedRate?: number | null
}

/** Moneda de una operación, con la misma precedencia que el resto de reportes. */
function operationCurrency(op: { sale_currency?: string | null; currency?: string | null } | null): string {
  return String(op?.sale_currency || op?.currency || "USD").toUpperCase()
}

/** Último día calendario del mes de una fecha YYYY-MM-DD. */
function lastDayOfMonth(dateKey: string): string {
  const [y, m] = dateKey.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${dateKey.slice(0, 7)}-${String(last).padStart(2, "0")}`
}

/**
 * Mes "YYYY-MM" de una fecha. `operation_date` es DATE, pero si alguna vez
 * llega con hora hay que bajarla a hora Argentina antes de cortar: una venta
 * del 31/07 a las 22h llega como 01/08 en UTC y caería en el mes siguiente.
 */
function monthKeyOf(value: string | null | undefined): string {
  if (!value) return ""
  return value.length === 10 ? value.slice(0, 7) : toArgentinaDateKey(value).slice(0, 7)
}

/**
 * Lleva una distribución ya registrada a la moneda del reporte.
 *
 * Se prefiere el `exchange_rate` guardado: es el TC con el que efectivamente se
 * repartió esa ganancia. El TC del reporte solo se usa como fallback para las
 * distribuciones viejas que no lo guardaron.
 */
function convertAllocation(
  row: PartnerAllocationRow,
  out: string,
  fallback: (amount: number, from: string, date: string) => number
): number {
  if (row.currency === out) return roundMoney(row.amount)
  const rate = row.exchangeRate
  if (rate && rate > 0) {
    if (row.currency === "USD" && out === "ARS") return roundMoney(row.amount * rate)
    if (row.currency === "ARS" && out === "USD") return roundMoney(row.amount / rate)
  }
  return fallback(row.amount, row.currency, `${row.monthKey}-01`)
}

const SIN_OFICINA = "Sin oficina"

/**
 * Clave de los gastos que no tienen oficina cargada.
 *
 * Es una clave distinta de `SIN_OFICINA` a propósito: una venta sin oficina es
 * un dato mal cargado en la operación, y un gasto sin oficina puede ser un
 * costo compartido legítimo (alquiler, contador) o también un pendiente de
 * clasificar. Son dos problemas con dos arreglos distintos; juntarlos en una
 * fila los volvería invisibles a los dos.
 */
const SIN_ASIGNAR = "Sin oficina asignada"

/**
 * Convierte un acumulador id → monto en filas de desglose ordenadas de mayor a
 * menor, aplicando el signo de la línea padre y descartando los ceros (una fila
 * en 0 solo agrega ruido a un documento que se presenta).
 */
function breakdownRows(
  agg: Map<string, number>,
  names: Map<string, string> | undefined,
  opts: {
    sign?: 1 | -1
    fallback?: string
    hints?: Map<string, string>
    /** La clave YA es la etiqueta (categorías de gasto), no un id a resolver. */
    keyIsLabel?: boolean
  } = {}
): SocietarioBreakdownRow[] {
  const { sign = 1, fallback = "Sin identificar", hints, keyIsLabel = false } = opts
  return Array.from(agg.entries())
    .map(([id, amount]) => ({
      key: id,
      label: keyIsLabel ? id : names?.get(id) || (id === SIN_OFICINA ? SIN_OFICINA : fallback),
      amount: roundMoney(amount * sign),
      hint: hints?.get(id),
    }))
    .filter((row) => row.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.label.localeCompare(b.label))
}

export function buildSocietarioReport(params: BuildSocietarioReportParams): SocietarioReport {
  const {
    operations,
    serviceExtras = {},
    includeServices = false,
    salesTruncated = false,
    expenses,
    excludedTouristicCount = 0,
    financialMovements = [],
    financialTruncated = false,
    expensesTruncated = false,
    commissionRecords,
    referralCommissions,
    commissionsExcluded = { settled: 0, cancelled: 0 },
    commissionsTruncated = false,
    operatorAdjustments = [],
    partners,
    allocations,
    agencyNames,
    sellerNames,
    referralPartnerNames,
    currency,
    ivaRate,
    netoIvaCriterio = "MARGEN",
    dateFrom,
    dateTo,
    getRate,
    fixedRate,
  } = params

  const out = (currency || "USD").toUpperCase()
  const fxParams = { currency: out, getRate, fixedRate }
  // Un converter por fuente: así el reporte puede decir si lo que falta de
  // convertir son las ventas, los gastos o las comisiones.
  const fxVentas = createMoneyConverter(fxParams)
  const fxComisiones = createMoneyConverter(fxParams)
  const fxFinanciero = createMoneyConverter(fxParams)
  const fxAjustes = createMoneyConverter(fxParams)
  const fxAllocations = createMoneyConverter(fxParams)

  const warnings: SocietarioWarning[] = []

  // ─────────────────────────────── Ventas ───────────────────────────────
  const monthKeys = monthKeysBetween(dateFrom, dateTo)
  const monthAgg = new Map<string, { ventas: number; margen: number; count: number }>()
  for (const key of monthKeys) monthAgg.set(key, { ventas: 0, margen: 0, count: 0 })

  let ventasTotal = 0
  let costoTotal = 0
  let margenTotal = 0
  let ivaBase = 0
  let marginRecalculated = 0

  // Desglose de ventas y costo por oficina.
  const ventasPorAgencia = new Map<string, number>()
  const costoPorAgencia = new Map<string, number>()
  const opsPorAgencia = new Map<string, number>()
  /**
   * Base del IVA por oficina: la suma de SUS márgenes positivos.
   *
   * Se acumula acá y no se prorratea el IVA total según la venta de cada
   * oficina. Prorratear rompería la regla de "solo márgenes positivos" en
   * cuanto una oficina tuviera operaciones con pérdida: le asignaría débito
   * fiscal que no generó.
   */
  const ivaBasePorAgencia = new Map<string, number>()

  for (const op of operations) {
    const extras = serviceExtras[op.id] ?? { saleExtra: 0, costExtra: 0 }
    const opCurrency = operationCurrency(op)
    const opDate = op.operation_date

    const sale = (Number(op.sale_amount_total) || 0) + (Number(extras.saleExtra) || 0)
    const cost = (Number(op.operator_cost) || 0) + (Number(extras.costExtra) || 0)
    const stored =
      (Number(op.margin_amount) || 0) + ((Number(extras.saleExtra) || 0) - (Number(extras.costExtra) || 0))
    const recalculated = sale - cost
    // El margen guardado se desactualiza cuando se edita la operación sin
    // recalcularlo. El motor de comisiones ya prefiere el recalculado.
    const usaRecalculado = Math.abs(recalculated - stored) > MARGIN_DRIFT_TOLERANCE
    if (usaRecalculado) marginRecalculated++
    const margin = usaRecalculado ? recalculated : stored

    const saleConv = fxVentas.take(sale, opCurrency, opDate)
    const costConv = fxVentas.convert(cost, opCurrency, opDate) ?? 0
    const marginConv = fxVentas.convert(margin, opCurrency, opDate) ?? 0

    ventasTotal += saleConv
    costoTotal += costConv
    margenTotal += marginConv
    // Solo los márgenes positivos generan débito fiscal.
    if (marginConv > 0) ivaBase += marginConv

    const agencyKey = op.agency_id || SIN_OFICINA
    ventasPorAgencia.set(agencyKey, (ventasPorAgencia.get(agencyKey) || 0) + saleConv)
    costoPorAgencia.set(agencyKey, (costoPorAgencia.get(agencyKey) || 0) + costConv)
    opsPorAgencia.set(agencyKey, (opsPorAgencia.get(agencyKey) || 0) + 1)
    if (marginConv > 0) {
      ivaBasePorAgencia.set(agencyKey, (ivaBasePorAgencia.get(agencyKey) || 0) + marginConv)
    }

    const bucket = monthAgg.get(monthKeyOf(opDate))
    if (bucket) {
      bucket.ventas += saleConv
      bucket.margen += marginConv
      bucket.count += 1
    }
  }

  const ventasCount = operations.length
  const byMonth: SocietarioMonthRow[] = monthKeys.map((key) => {
    const g = monthAgg.get(key)!
    return {
      key,
      label: monthLabel(key),
      ventas: roundMoney(g.ventas),
      margen: roundMoney(g.margen),
      count: g.count,
    }
  })

  // ─────────────────────────────── Gastos ───────────────────────────────
  // Se reusa la conversión del reporte de Gastos: si se implementara de nuevo
  // acá, los dos reportes mostrarían números distintos con el tiempo.
  const { converted: gastosConv, missingRate: gastosMissing } = convertExpensesTo(
    expenses,
    out,
    fixedRate != null && Number.isFinite(fixedRate) && fixedRate > 0 ? () => fixedRate : getRate
  )

  let gastosTotal = 0
  let gastosRecurring = 0
  let gastosVariable = 0
  /**
   * Gastos por oficina. Los que no la tienen van a su propia clave y NO se
   * prorratean: repartir alquiler y sueldos entre oficinas exige una clave de
   * asignación (por venta, por headcount, por m²) que no existe en el sistema
   * y que es una decisión del contador, no del reporte.
   */
  const gastosPorAgencia = new Map<string, number>()
  const categoryAgg = new Map<string, { total: number; count: number; color: string | null }>()
  for (const e of gastosConv) {
    gastosTotal += e.convertedAmount
    const gastoKey = e.agency_id || SIN_ASIGNAR
    gastosPorAgencia.set(gastoKey, (gastosPorAgencia.get(gastoKey) || 0) + e.convertedAmount)
    if (e.expense_type === "recurring") gastosRecurring += e.convertedAmount
    else gastosVariable += e.convertedAmount

    const name = e.category?.trim() || UNCATEGORIZED_LABEL
    const prev = categoryAgg.get(name)
    categoryAgg.set(name, {
      total: (prev?.total || 0) + e.convertedAmount,
      count: (prev?.count || 0) + 1,
      color: prev?.color || e.category_color || null,
    })
  }

  const byCategory: SocietarioCategoryRow[] = Array.from(categoryAgg.entries())
    .map(([category, g]) => ({ category, ...g }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category))
    .map((row, i) => ({
      category: row.category,
      color: row.color || EXPENSE_CATEGORY_PALETTE[i % EXPENSE_CATEGORY_PALETTE.length],
      total: roundMoney(row.total),
      count: row.count,
      share: roundMoney(safeDiv(row.total, gastosTotal) * 100, 1),
    }))

  // ─────────────────────── Resultado financiero ─────────────────────────
  // Converter propio: si falta un TC acá, el reporte tiene que poder decir que
  // lo que no se pudo convertir es el resultado financiero y no los gastos.
  let financieroIngresos = 0
  let financieroCostos = 0
  let financieroCountIngresos = 0
  let financieroCountCostos = 0
  for (const m of financialMovements) {
    const monto = fxFinanciero.take(m.amount, m.currency, m.movement_date)
    if (m.kind === "INCOME") {
      financieroIngresos += monto
      financieroCountIngresos++
    } else {
      financieroCostos += monto
      financieroCountCostos++
    }
  }
  const resultadoFinanciero = roundMoney(financieroIngresos - financieroCostos)

  // ───────────────────────────── Comisiones ─────────────────────────────
  let comisionesVendedores = 0
  const comisionPorVendedor = new Map<string, number>()
  /**
   * Comisiones por oficina, con la de la OPERACIÓN como clave.
   *
   * `commission_records.agency_id` existe, pero puede quedar desactualizado si
   * la operación cambió de oficina. Usar el de la operación es lo que hace que
   * el ratio comisiones/margen de cada fila reconcilie con su propia venta.
   */
  const comisionVendedoresPorAgencia = new Map<string, number>()
  for (const rec of commissionRecords) {
    const monto = fxComisiones.take(
      Number(rec.amount) || 0,
      operationCurrency(rec.operations),
      // La comisión se valúa con la fecha de SU venta: usar otra haría que la
      // relación comisión/margen se mueva sola por el tipo de cambio.
      rec.operations?.operation_date ?? null
    )
    comisionesVendedores += monto
    const key = rec.seller_id || "sin-vendedor"
    comisionPorVendedor.set(key, (comisionPorVendedor.get(key) || 0) + monto)
    const agKey = (rec.operations as any)?.agency_id || rec.agency_id || SIN_OFICINA
    comisionVendedoresPorAgencia.set(
      agKey,
      (comisionVendedoresPorAgencia.get(agKey) || 0) + monto
    )
  }

  let comisionesReferidos = 0
  const comisionPorReferidor = new Map<string, number>()
  const comisionReferidoresPorAgencia = new Map<string, number>()
  for (const ref of referralCommissions) {
    const monto = fxComisiones.take(ref.amount, ref.currency, ref.operationDate)
    comisionesReferidos += monto
    const key = ref.partnerId || "sin-referidor"
    comisionPorReferidor.set(key, (comisionPorReferidor.get(key) || 0) + monto)
    const agKey = ref.agencyId || SIN_OFICINA
    comisionReferidoresPorAgencia.set(
      agKey,
      (comisionReferidoresPorAgencia.get(agKey) || 0) + monto
    )
  }

  const comisionesTotal = comisionesVendedores + comisionesReferidos

  // ──────────────── Ajustes de liquidación de operador ──────────────────
  //
  // Sólo la parte de COSTO. El reparto con el vendedor no se suma acá: esas
  // filas son `commission_records` y ya entraron arriba, en "Comisiones". Si se
  // sumaran las dos cosas, el reparto se contaría dos veces.
  //
  // Se valúa con la fecha de imputación del ajuste, no con la de la venta: la
  // diferencia se conoció en ese momento y ese es el mes al que pertenece.
  let ajustesResultado = 0
  let ajustesGanancia = 0
  let ajustesPerdida = 0
  const ajustePorAgencia = new Map<string, number>()

  for (const adj of operatorAdjustments) {
    // −delta: un costo más alto es una pérdida.
    const monto = fxAjustes.take(-Number(adj.deltaAmount) || 0, adj.currency, adj.accrualDate)
    ajustesResultado += monto
    if (monto >= 0) ajustesGanancia += monto
    else ajustesPerdida += monto

    const agKey = adj.agencyId || SIN_OFICINA
    ajustePorAgencia.set(agKey, (ajustePorAgencia.get(agKey) || 0) + monto)
  }

  ajustesResultado = roundMoney(ajustesResultado)

  const ajustesBreakdown: SocietarioBreakdownRow[] = []
  if (roundMoney(ajustesGanancia) !== 0) {
    ajustesBreakdown.push({
      key: "ganancia",
      label: "Liquidaciones más baratas de lo estimado",
      amount: roundMoney(ajustesGanancia),
    })
  }
  if (roundMoney(ajustesPerdida) !== 0) {
    ajustesBreakdown.push({
      key: "perdida",
      label: "Liquidaciones más caras de lo estimado",
      amount: roundMoney(ajustesPerdida),
    })
  }

  // ──────────────────────────── Resultado ───────────────────────────────
  const rate = Number.isFinite(ivaRate) && ivaRate > 0 ? ivaRate : 0
  const iva = roundMoney(ivaBase * rate)
  const gananciaBruta = roundMoney(margenTotal)
  const margenNetoIva = roundMoney(gananciaBruta - iva)
  const gananciaNeta = roundMoney(
    margenNetoIva - comisionesTotal - gastosTotal + resultadoFinanciero + ajustesResultado
  )

  // ───────────────────────── Venta neta de IVA ──────────────────────────
  // Se calcula acá y NO se enchufa a la cascada de arriba. Con el criterio
  // VENTA el IVA es del orden del margen entero, así que restarlo del resultado
  // dejaría a los socios repartiendo una pérdida por haber cambiado un selector
  // de presentación. `gananciaNeta`, `margenNetoIva` y el waterfall son
  // idénticos en los dos criterios; hay un test que lo fija.
  const ivaVentaNeta =
    netoIvaCriterio === "VENTA" ? roundMoney(ventasTotal - ventasTotal / (1 + rate)) : iva
  const ventaNetaBloque = {
    criterio: netoIvaCriterio,
    ivaRate: rate,
    bruta: roundMoney(ventasTotal),
    iva: ivaVentaNeta,
    neta: roundMoney(ventasTotal - ivaVentaNeta),
  }

  // ───────────────────────── Cierre por oficina ─────────────────────────
  // Las cuatro cifras que se necesitan para cerrar el mes, abiertas por
  // oficina. Se corta en la ganancia bruta: los gastos sin oficina no son
  // atribuibles y el resultado financiero no registra oficina, así que una
  // columna de "ganancia neta por oficina" sería un número que no suma al
  // total y que nadie podría auditar.
  const clavesDeAgencia = Array.from(
    new Set<string>([
      ...Array.from(ventasPorAgencia.keys()),
      ...Array.from(costoPorAgencia.keys()),
      ...Array.from(comisionVendedoresPorAgencia.keys()),
      ...Array.from(comisionReferidoresPorAgencia.keys()),
      ...Array.from(gastosPorAgencia.keys()),
    ])
  )

  const agencyRows: SocietarioAgencyRow[] = []
  for (const key of clavesDeAgencia) {
    const kind: SocietarioAgencyRow["kind"] =
      key === SIN_ASIGNAR ? "SIN_ASIGNAR" : key === SIN_OFICINA ? "SIN_OFICINA" : "AGENCY"

    const ventaBruta = roundMoney(ventasPorAgencia.get(key) || 0)
    const costoOperador = roundMoney(costoPorAgencia.get(key) || 0)
    const baseIva = ivaBasePorAgencia.get(key) || 0
    // Mismo criterio que el total, aplicado a los números de esta oficina.
    const ivaFila =
      netoIvaCriterio === "VENTA"
        ? roundMoney(ventaBruta - ventaBruta / (1 + rate))
        : roundMoney(baseIva * rate)
    const comisionesVendedoresFila = roundMoney(comisionVendedoresPorAgencia.get(key) || 0)
    const comisionesReferidoresFila = roundMoney(comisionReferidoresPorAgencia.get(key) || 0)

    const fila: SocietarioAgencyRow = {
      key,
      agencyId: kind === "AGENCY" ? key : null,
      name:
        kind === "AGENCY"
          ? agencyNames?.get(key) || "Oficina sin nombre"
          : kind === "SIN_ASIGNAR"
            ? SIN_ASIGNAR
            : SIN_OFICINA,
      kind,
      operaciones: opsPorAgencia.get(key) || 0,
      ventaBruta,
      ivaBase: roundMoney(baseIva),
      iva: ivaFila,
      ventaNeta: roundMoney(ventaBruta - ivaFila),
      costoOperador,
      gananciaBruta: roundMoney(ventaBruta - costoOperador),
      comisionesVendedores: comisionesVendedoresFila,
      comisionesReferidores: comisionesReferidoresFila,
      comisiones: roundMoney(comisionesVendedoresFila + comisionesReferidoresFila),
      gastos: roundMoney(gastosPorAgencia.get(key) || 0),
    }

    // Una fila enteramente en cero solo agrega ruido, igual que en el desglose
    // de la cascada.
    const tieneAlgo =
      fila.operaciones !== 0 ||
      fila.ventaBruta !== 0 ||
      fila.comisiones !== 0 ||
      fila.gastos !== 0 ||
      fila.costoOperador !== 0
    if (tieneAlgo) agencyRows.push(fila)
  }

  // Las oficinas reales primero por venta; las dos filas sin oficina al final,
  // que es donde se leen como "lo que falta clasificar".
  const ordenKind: Record<SocietarioAgencyRow["kind"], number> = {
    AGENCY: 0,
    SIN_OFICINA: 1,
    SIN_ASIGNAR: 2,
    TOTAL: 3,
  }
  agencyRows.sort(
    (a, b) => ordenKind[a.kind] - ordenKind[b.kind] || b.ventaBruta - a.ventaBruta
  )

  // El total se arma SUMANDO las filas, no recalculando: así, si una fila se
  // perdiera, el total no cerraría contra `resultado` y el test lo caza.
  const sumaFilas = (pick: (r: SocietarioAgencyRow) => number) =>
    roundMoney(agencyRows.reduce((acc, r) => acc + pick(r), 0))

  const agencyTotal: SocietarioAgencyRow = {
    key: "TOTAL",
    agencyId: null,
    name: "Total",
    kind: "TOTAL",
    operaciones: agencyRows.reduce((acc, r) => acc + r.operaciones, 0),
    ventaBruta: sumaFilas((r) => r.ventaBruta),
    ivaBase: sumaFilas((r) => r.ivaBase),
    iva: sumaFilas((r) => r.iva),
    ventaNeta: sumaFilas((r) => r.ventaNeta),
    costoOperador: sumaFilas((r) => r.costoOperador),
    gananciaBruta: sumaFilas((r) => r.gananciaBruta),
    comisionesVendedores: sumaFilas((r) => r.comisionesVendedores),
    comisionesReferidores: sumaFilas((r) => r.comisionesReferidores),
    comisiones: sumaFilas((r) => r.comisiones),
    gastos: sumaFilas((r) => r.gastos),
  }

  // ─────────────────────── Desglose de cada línea ───────────────────────
  const opsHint = new Map(
    Array.from(opsPorAgencia.entries()).map(([id, n]) => [
      id,
      `${n} ${n === 1 ? "operación" : "operaciones"}`,
    ])
  )

  const ventasBreakdown = breakdownRows(ventasPorAgencia, agencyNames, {
    fallback: SIN_OFICINA,
    hints: opsHint,
  })
  const costoBreakdown = breakdownRows(costoPorAgencia, agencyNames, {
    sign: -1,
    fallback: SIN_OFICINA,
    hints: opsHint,
  })

  // Vendedores y referidores son entidades distintas y su plata también:
  // agruparlas por separado es lo que permite responder "¿cuánto se lleva cada
  // vendedor?" sin mezclarlo con lo que se le debe a una agencia que refirió.
  const vendedoresRows = breakdownRows(comisionPorVendedor, sellerNames, {
    sign: -1,
    fallback: "Sin vendedor asignado",
  })
  const referidoresRows = breakdownRows(comisionPorReferidor, referralPartnerNames, {
    sign: -1,
    fallback: "Sin referidor identificado",
  })

  const comisionesBreakdown: SocietarioBreakdownRow[] = []
  if (vendedoresRows.length > 0) {
    comisionesBreakdown.push({
      key: "vendedores",
      label: "Vendedores",
      amount: -roundMoney(comisionesVendedores),
      hint: `${commissionRecords.length} ${commissionRecords.length === 1 ? "comisión" : "comisiones"}`,
      children: vendedoresRows,
    })
  }
  if (referidoresRows.length > 0) {
    comisionesBreakdown.push({
      key: "referidores",
      label: "Referidores",
      amount: -roundMoney(comisionesReferidos),
      hint: `${referralCommissions.length} ${referralCommissions.length === 1 ? "comisión" : "comisiones"}`,
      children: referidoresRows,
    })
  }

  // Gastos: primero fijos vs variables, y dentro de cada uno sus categorías.
  const gastosBreakdown: SocietarioBreakdownRow[] = []
  for (const tipo of ["recurring", "variable"] as const) {
    const totalTipo = tipo === "recurring" ? gastosRecurring : gastosVariable
    if (roundMoney(totalTipo) === 0) continue
    const catAgg = new Map<string, number>()
    for (const e of gastosConv) {
      if (e.expense_type !== tipo) continue
      const name = e.category?.trim() || UNCATEGORIZED_LABEL
      catAgg.set(name, (catAgg.get(name) || 0) + e.convertedAmount)
    }
    gastosBreakdown.push({
      key: tipo,
      label: tipo === "recurring" ? "Fijos / recurrentes" : "Variables",
      amount: -roundMoney(totalTipo),
      children: breakdownRows(catAgg, undefined, { sign: -1, keyIsLabel: true }),
    })
  }

  // El IVA no se desglosa en partes: lo que hace falta explicar es de dónde
  // sale, o sea la base imponible y la alícuota aplicada.
  const ivaBreakdown: SocietarioBreakdownRow[] =
    iva !== 0
      ? [
          {
            key: "base",
            label: "Base imponible (márgenes positivos)",
            amount: roundMoney(ivaBase),
            hint: `Alícuota ${(rate * 100).toLocaleString("es-AR")}%`,
          },
        ]
      : []

  // Resultado financiero: la ganancia por depósito y la comisión de la
  // financiera por separado, para que se lea de dónde salió el neto.
  const financieroBreakdown: SocietarioBreakdownRow[] = []
  if (roundMoney(financieroIngresos) !== 0) {
    financieroBreakdown.push({
      key: "ganancia",
      label: "Ganancia financiera por depósito",
      amount: roundMoney(financieroIngresos),
      hint: `${financieroCountIngresos} ${financieroCountIngresos === 1 ? "movimiento" : "movimientos"}`,
    })
  }
  if (roundMoney(financieroCostos) !== 0) {
    financieroBreakdown.push({
      key: "costo",
      label: "Costo financiero (comisión de financiera)",
      amount: -roundMoney(financieroCostos),
      hint: `${financieroCountCostos} ${financieroCountCostos === 1 ? "movimiento" : "movimientos"}`,
    })
  }

  const waterfall: SocietarioWaterfallStep[] = [
    {
      key: "ventas",
      label: "Ventas",
      amount: roundMoney(ventasTotal),
      kind: "base",
      breakdown: ventasBreakdown,
    },
    {
      key: "costo",
      label: "Costo operador",
      amount: -roundMoney(costoTotal),
      kind: "deduction",
      breakdown: costoBreakdown,
    },
    { key: "bruta", label: "Ganancia bruta", amount: gananciaBruta, kind: "subtotal" },
    {
      key: "iva",
      label: "IVA estimado sobre margen",
      amount: -iva,
      kind: "deduction",
      breakdown: ivaBreakdown,
    },
    { key: "neto-iva", label: "Margen neto de IVA", amount: margenNetoIva, kind: "subtotal" },
    {
      key: "comisiones",
      label: "Comisiones",
      amount: -roundMoney(comisionesTotal),
      kind: "deduction",
      breakdown: comisionesBreakdown,
    },
    {
      key: "gastos",
      label: "Gastos operativos",
      amount: -roundMoney(gastosTotal),
      kind: "deduction",
      breakdown: gastosBreakdown,
    },
    // Igual que el resultado financiero: sólo si hubo. Una agencia que nunca
    // ajustó una liquidación no necesita ver la fila en cero.
    ...(ajustesBreakdown.length > 0
      ? [
          {
            key: "ajustes",
            label: "Ajustes de liquidación de operadores",
            amount: ajustesResultado,
            kind: "adjustment" as const,
            breakdown: ajustesBreakdown,
          },
        ]
      : []),
    // Sólo si hubo movimientos: la mayoría de las agencias no usa financiera y
    // una fila en cero es ruido, igual que un tipo de gasto sin importe.
    ...(financieroBreakdown.length > 0
      ? [
          {
            key: "financiero",
            label: "Resultado financiero",
            amount: resultadoFinanciero,
            kind: "adjustment" as const,
            breakdown: financieroBreakdown,
          },
        ]
      : []),
    { key: "neta", label: "Ganancia neta a repartir", amount: gananciaNeta, kind: "result" },
  ]

  // ────────────────────────────── Socios ────────────────────────────────
  const activos = partners.filter((p) => p.isActive)
  const percentageSum = roundMoney(activos.reduce((acc, p) => acc + (Number(p.percentage) || 0), 0))
  const percentageValid = Math.abs(percentageSum - 100) <= PERCENTAGE_TOLERANCE

  const socioRows: SocietarioPartnerRow[] = activos
    .map((p, i) => ({
      partnerId: p.id,
      name: p.name,
      percentage: roundMoney(Number(p.percentage) || 0),
      // Sobre el porcentaje cargado, sin normalizar: si suman 92, se reparte 92
      // y el 8 restante se ve como "sin asignar". Normalizar escondería el
      // error de configuración justo en el número que se va a presentar.
      amount: roundMoney((gananciaNeta * (Number(p.percentage) || 0)) / 100),
      color: seriesColor(i),
    }))
    .sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name))

  const repartido = roundMoney(socioRows.reduce((acc, r) => acc + r.amount, 0))
  const unassignedAmount = roundMoney(gananciaNeta - repartido)

  // ───────────────────── Distribuciones registradas ─────────────────────
  let allocationsBlock: SocietarioReport["allocations"] = null
  if (allocations && allocations.length > 0) {
    // El período cubre meses completos: recién ahí una diferencia contra lo
    // calculado significa algo.
    const coversPeriod = dateFrom.slice(8) === "01" && dateTo === lastDayOfMonth(dateTo)
    const nameById = new Map(partners.map((p) => [p.id, p.name]))
    const computedById = new Map(socioRows.map((r) => [r.partnerId, r.amount]))

    const agg = new Map<string, number>()
    for (const a of allocations) {
      const converted = convertAllocation(a, out, (amount, from, date) =>
        fxAllocations.take(amount, from, date)
      )
      agg.set(a.partnerId, (agg.get(a.partnerId) || 0) + converted)
    }

    const rows: SocietarioAllocationRow[] = Array.from(agg.entries())
      .map(([partnerId, allocated]) => {
        const computed = computedById.get(partnerId) ?? 0
        return {
          partnerId,
          name: nameById.get(partnerId) || "Socio dado de baja",
          allocated: roundMoney(allocated),
          computed,
          difference: coversPeriod ? roundMoney(computed - allocated) : null,
        }
      })
      .sort((a, b) => b.allocated - a.allocated || a.name.localeCompare(b.name))

    allocationsBlock = {
      coversPeriod,
      monthsInPeriod: monthKeys.length,
      monthsWithAllocation: new Set(allocations.map((a) => a.monthKey)).size,
      total: roundMoney(rows.reduce((acc, r) => acc + r.allocated, 0)),
      rows,
    }
  }

  // ───────────────────────────── Warnings ───────────────────────────────
  if (netoIvaCriterio === "VENTA" && rate > 0) {
    warnings.push({
      code: "NETO_IVA_CRITERIO_VENTA",
      level: "warning",
      message: `La venta neta se calculó tratando la venta como IVA incluido (venta ÷ ${(1 + rate).toLocaleString("es-AR")}). Ese IVA es el débito bruto: no netea el crédito fiscal del costo del operador. La ganancia a repartir de abajo sigue usando el IVA sobre el margen, que es el débito real de una agencia de intermediación.`,
    })
  }

  if (activos.length === 0) {
    warnings.push({
      code: "NO_PARTNERS",
      level: "warning",
      message: "No hay socios activos cargados: no se puede repartir la ganancia.",
    })
  } else if (!percentageValid) {
    warnings.push({
      code: "PERCENTAGES_NOT_100",
      level: "danger",
      message: `Las participaciones suman ${percentageSum.toLocaleString("es-AR")}% en lugar de 100%. El reparto que se muestra usa los porcentajes tal como están cargados.`,
    })
  }

  const comisionesEnGastos = byCategory.filter((c) => /comisi/i.test(c.category))
  if (comisionesEnGastos.length > 0) {
    const total = roundMoney(comisionesEnGastos.reduce((acc, c) => acc + c.total, 0))
    warnings.push({
      code: "COMMISSION_LIKE_EXPENSES",
      level: "danger",
      message: `Hay ${total.toLocaleString("es-AR")} ${out} en gastos con categoría de comisiones. Las comisiones ya se descuentan como devengadas: si eso es su liquidación, está restado dos veces.`,
    })
  }

  const impuestosEnGastos = byCategory.filter((c) => /impuesto|iva/i.test(c.category))
  if (impuestosEnGastos.length > 0 && rate > 0) {
    const total = roundMoney(impuestosEnGastos.reduce((acc, c) => acc + c.total, 0))
    warnings.push({
      code: "TAX_LIKE_EXPENSES",
      level: "warning",
      message: `Hay ${total.toLocaleString("es-AR")} ${out} en gastos de impuestos y además se está estimando IVA sobre el margen. Si el IVA ya está cargado como gasto, poné la alícuota en 0%.`,
    })
  }

  // Detector de doble conteo: antes de que existiera la línea propia, la
  // comisión de la financiera se cargaba a mano como gasto variable. Si sigue
  // cargada así Y además viene por el circuito nuevo, está restada dos veces.
  const financierosEnGastos = byCategory.filter((c) => /financ/i.test(c.category))
  if (financierosEnGastos.length > 0) {
    const total = roundMoney(financierosEnGastos.reduce((acc, c) => acc + c.total, 0))
    warnings.push({
      code: "FINANCIAL_LIKE_EXPENSES",
      level: "danger",
      message: `Hay ${total.toLocaleString("es-AR")} ${out} en gastos operativos con categoría financiera. El costo de la financiera ahora se registra en su propia línea: si eso es una comisión cargada a mano, está restada dos veces.`,
    })
  }

  const missingTotal =
    fxVentas.missing().length +
    gastosMissing.length +
    fxComisiones.missing().length +
    fxFinanciero.missing().length
  if (missingTotal > 0) {
    warnings.push({
      code: "MISSING_RATE",
      level: "danger",
      message:
        "Hay montos que no se pudieron convertir por falta de tipo de cambio y quedaron fuera de los totales.",
    })
  }

  if (salesTruncated || commissionsTruncated || financialTruncated || expensesTruncated) {
    warnings.push({
      code: "TRUNCATED",
      level: "danger",
      message:
        "El período tiene más registros de los que se pudieron leer de una vez. Los totales están incompletos: acotá el rango de fechas.",
    })
  }

  if (marginRecalculated > 0) {
    warnings.push({
      code: "MARGIN_RECALCULATED",
      level: "warning",
      message: `${marginRecalculated} operación/es tenían el margen guardado desactualizado y se recalcularon (venta − costo operador).`,
    })
  }

  if (allocationsBlock && !allocationsBlock.coversPeriod) {
    warnings.push({
      code: "ALLOCATIONS_PARTIAL",
      level: "warning",
      message:
        "La distribución registrada es mensual y el período elegido no cubre meses completos: los montos no son comparables con la participación calculada.",
    })
  }

  if (gananciaNeta < 0) {
    warnings.push({
      code: "NEGATIVE_RESULT",
      level: "warning",
      message: "El período cerró con pérdida: lo que se reparte es el resultado negativo.",
    })
  }

  return {
    currency: out,
    dateFrom,
    dateTo,
    conversion: { mode: fxVentas.mode, rate: fxVentas.fixedRate },
    ventas: {
      count: ventasCount,
      total: roundMoney(ventasTotal),
      cost: roundMoney(costoTotal),
      margin: gananciaBruta,
      averageTicket: roundMoney(safeDiv(ventasTotal, ventasCount)),
      marginPct: roundMoney(safeDiv(margenTotal, ventasTotal) * 100, 1),
      includeServices,
      marginRecalculated,
      truncated: salesTruncated,
      missingRate: fxVentas.missing(),
      byMonth,
    },
    gastos: {
      total: roundMoney(gastosTotal),
      count: gastosConv.length,
      recurring: roundMoney(gastosRecurring),
      variable: roundMoney(gastosVariable),
      byCategory,
      excludedTouristic: excludedTouristicCount,
      missingRate: gastosMissing,
    },
    financiero: {
      ingresos: roundMoney(financieroIngresos),
      costos: roundMoney(financieroCostos),
      neto: resultadoFinanciero,
      count: financieroCountIngresos + financieroCountCostos,
      countIngresos: financieroCountIngresos,
      countCostos: financieroCountCostos,
      truncated: financialTruncated,
      missingRate: fxFinanciero.missing(),
    },
    comisiones: {
      total: roundMoney(comisionesTotal),
      sellers: { total: roundMoney(comisionesVendedores), count: commissionRecords.length },
      referrals: { total: roundMoney(comisionesReferidos), count: referralCommissions.length },
      base: "GROSS_MARGIN",
      baseLabel: "ganancia bruta (venta − costo operador)",
      effectiveRate: roundMoney(safeDiv(comisionesTotal, gananciaBruta) * 100, 1),
      excluded: commissionsExcluded,
      truncated: commissionsTruncated,
      missingRate: fxComisiones.missing(),
    },
    ventaNeta: ventaNetaBloque,
    porAgencia: {
      criterio: netoIvaCriterio,
      rows: agencyRows,
      total: agencyTotal,
    },
    resultado: {
      ventas: roundMoney(ventasTotal),
      costoOperador: roundMoney(costoTotal),
      gananciaBruta,
      ivaRate: rate,
      ivaBase: roundMoney(ivaBase),
      iva,
      margenNetoIva,
      comisiones: roundMoney(comisionesTotal),
      gastos: roundMoney(gastosTotal),
      resultadoFinanciero,
      gananciaNeta,
      netMarginPct: roundMoney(safeDiv(gananciaNeta, ventasTotal) * 100, 1),
      waterfall,
    },
    socios: {
      percentageSum,
      percentageValid,
      unassignedAmount,
      rows: socioRows,
    },
    allocations: allocationsBlock,
    warnings,
  }
}
