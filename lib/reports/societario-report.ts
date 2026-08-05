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
 *            − comisiones − gastos     = GANANCIA NETA A REPARTIR
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
 */

import { roundMoney } from "@/lib/currency"
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

/** Diferencia aceptable al validar que las participaciones sumen 100. */
const PERCENTAGE_TOLERANCE = 0.01

export type SocietarioWarningCode =
  | "PERCENTAGES_NOT_100"
  | "NO_PARTNERS"
  | "COMMISSION_LIKE_EXPENSES"
  | "TAX_LIKE_EXPENSES"
  | "MISSING_RATE"
  | "TRUNCATED"
  | "ALLOCATIONS_PARTIAL"
  | "MARGIN_RECALCULATED"
  | "NEGATIVE_RESULT"

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

export interface SocietarioWaterfallStep {
  key: string
  label: string
  amount: number
  kind: "base" | "deduction" | "subtotal" | "result"
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
  // ── comisiones
  commissionRecords: CommissionRecordRow[]
  referralCommissions: ReferralCommissionRow[]
  commissionsExcluded?: { settled: number; cancelled: number }
  commissionsTruncated?: boolean
  // ── socios
  partners: OrgPartner[]
  allocations?: PartnerAllocationRow[]
  // ── parámetros
  /** Moneda de SALIDA. */
  currency: string
  /** Fracción: 0.105 = 10,5%. */
  ivaRate: number
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

export function buildSocietarioReport(params: BuildSocietarioReportParams): SocietarioReport {
  const {
    operations,
    serviceExtras = {},
    includeServices = false,
    salesTruncated = false,
    expenses,
    excludedTouristicCount = 0,
    commissionRecords,
    referralCommissions,
    commissionsExcluded = { settled: 0, cancelled: 0 },
    commissionsTruncated = false,
    partners,
    allocations,
    currency,
    ivaRate,
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
  const categoryAgg = new Map<string, { total: number; count: number; color: string | null }>()
  for (const e of gastosConv) {
    gastosTotal += e.convertedAmount
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

  // ───────────────────────────── Comisiones ─────────────────────────────
  let comisionesVendedores = 0
  for (const rec of commissionRecords) {
    comisionesVendedores += fxComisiones.take(
      Number(rec.amount) || 0,
      operationCurrency(rec.operations),
      // La comisión se valúa con la fecha de SU venta: usar otra haría que la
      // relación comisión/margen se mueva sola por el tipo de cambio.
      rec.operations?.operation_date ?? null
    )
  }

  let comisionesReferidos = 0
  for (const ref of referralCommissions) {
    comisionesReferidos += fxComisiones.take(ref.amount, ref.currency, ref.operationDate)
  }

  const comisionesTotal = comisionesVendedores + comisionesReferidos

  // ──────────────────────────── Resultado ───────────────────────────────
  const rate = Number.isFinite(ivaRate) && ivaRate > 0 ? ivaRate : 0
  const iva = roundMoney(ivaBase * rate)
  const gananciaBruta = roundMoney(margenTotal)
  const margenNetoIva = roundMoney(gananciaBruta - iva)
  const gananciaNeta = roundMoney(margenNetoIva - comisionesTotal - gastosTotal)

  const waterfall: SocietarioWaterfallStep[] = [
    { key: "ventas", label: "Ventas", amount: roundMoney(ventasTotal), kind: "base" },
    { key: "costo", label: "Costo operador", amount: -roundMoney(costoTotal), kind: "deduction" },
    { key: "bruta", label: "Ganancia bruta", amount: gananciaBruta, kind: "subtotal" },
    { key: "iva", label: "IVA estimado sobre margen", amount: -iva, kind: "deduction" },
    { key: "neto-iva", label: "Margen neto de IVA", amount: margenNetoIva, kind: "subtotal" },
    { key: "comisiones", label: "Comisiones", amount: -roundMoney(comisionesTotal), kind: "deduction" },
    { key: "gastos", label: "Gastos operativos", amount: -roundMoney(gastosTotal), kind: "deduction" },
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

  const missingTotal =
    fxVentas.missing().length + gastosMissing.length + fxComisiones.missing().length
  if (missingTotal > 0) {
    warnings.push({
      code: "MISSING_RATE",
      level: "danger",
      message:
        "Hay montos que no se pudieron convertir por falta de tipo de cambio y quedaron fuera de los totales.",
    })
  }

  if (salesTruncated || commissionsTruncated) {
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
