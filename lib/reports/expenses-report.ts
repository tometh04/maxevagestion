/**
 * Agregación del Reporte de Gastos (VIB-64).
 *
 * Función pura: recibe los gastos ya leídos por `lib/expenses/fetch-expenses.ts`
 * y devuelve todo lo que muestran la pantalla y el PDF (KPIs, torta por
 * categoría, evolución temporal, desglose por tipo/cuenta y detalle).
 *
 * Reglas:
 *  - El reporte trae TODOS los gastos del período juntos, convertidos a la
 *    moneda elegida. Antes filtraba por moneda: elegías USD y los gastos en
 *    pesos desaparecían, y al revés. El cliente lo vivía como "los pagos no
 *    impactaron", cuando en realidad estaban en la otra vista.
 *  - La conversión usa el tipo de cambio de la fecha DE CADA GASTO, no uno
 *    único del período. Es lo que da el costo real acumulado, y es lo que
 *    corresponde cuando el TC se mueve dentro del mes.
 *  - Un gasto que no se puede convertir por falta de tipo de cambio NO se
 *    descarta en silencio: sale contado aparte en `summary.missingRate`. Todo
 *    este arreglo nació de gastos que desaparecían sin avisar; cambiar una
 *    omisión silenciosa por otra sería el mismo error.
 *  - Los porcentajes y promedios se calculan sobre el dataset completo del
 *    período, no sobre una página o un top-N truncado.
 *  - Las fechas se bucketean en hora Argentina (-03:00), igual que el filtro de
 *    rango (`lib/utils/date-range.ts`), para que un gasto cargado a las 23h no
 *    caiga en el día siguiente.
 */

import { roundMoney } from "@/lib/currency"
import type { ExpenseRow, ExpenseType } from "@/lib/expenses/fetch-expenses"

/**
 * Paleta categórica de respaldo para categorías sin color propio. En HEX (no
 * HSL) porque la comparte el PDF, donde jsPDF necesita componentes RGB.
 * Tonos distinguibles entre sí y legibles en light/dark.
 */
export const EXPENSE_CATEGORY_PALETTE = [
  "#F6BB09", // amber
  "#F47825", // orange
  "#29BC5F", // green
  "#17B0CF", // cyan
  "#E23670", // pink/red
  "#8652E0", // violet
  "#308CE8", // blue
  "#2BAB81", // teal
  "#E85E30", // coral
  "#7EA12E", // lime
]

export const UNCATEGORIZED_LABEL = "Sin categoría"

export interface ExpensesReportCategory {
  category: string
  color: string
  total: number
  count: number
  /** % sobre el total del período, 0-100. */
  share: number
}

export interface ExpensesReportBucket {
  /** "2026-07" (mes) o "2026-07-14" (día). */
  key: string
  /** Etiqueta corta lista para el eje del gráfico. */
  label: string
  total: number
  count: number
}

export interface ExpensesReportTypeRow {
  type: ExpenseType
  label: string
  total: number
  count: number
  share: number
}

export interface ExpensesReportAccount {
  account: string
  total: number
  count: number
}

export interface ExpensesReportDetailRow {
  id: string
  /** Fecha local AR en formato YYYY-MM-DD. */
  date: string
  description: string
  category: string
  categoryColor: string
  type: ExpenseType
  account: string
  user: string
  /** Importe en la moneda del reporte, ya convertido. */
  amount: number
  /** Importe tal como se cargó. Igual a `amount` si no hubo conversión. */
  originalAmount: number
  originalCurrency: string
  /** TC aplicado (USD→ARS). null si no hizo falta convertir. */
  exchangeRate: number | null
}

/** Gastos que quedaron fuera del total por no tener tipo de cambio. */
export interface ExpensesReportMissingRate {
  currency: string
  count: number
  /** Total en su moneda original: no se puede expresar en la del reporte. */
  total: number
}

export interface ExpensesReport {
  currency: string
  dateFrom: string
  dateTo: string
  summary: {
    total: number
    count: number
    /** Promedio por gasto. */
    average: number
    /** Promedio por día del período. */
    dailyAverage: number
    days: number
    topCategory: { category: string; total: number; share: number } | null
    /** Cuántos gastos hubo que convertir y cuánto del total viene de ahí. */
    converted: { count: number; total: number } | null
    /** Gastos excluidos por falta de TC. Vacío = el total está completo. */
    missingRate: ExpensesReportMissingRate[]
  }
  byCategory: ExpensesReportCategory[]
  byType: ExpensesReportTypeRow[]
  byBucket: ExpensesReportBucket[]
  bucketMode: "day" | "month"
  byAccount: ExpensesReportAccount[]
  detail: ExpensesReportDetailRow[]
}

const AR_OFFSET_MS = 3 * 60 * 60 * 1000 // -03:00

const MONTH_LABELS = [
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

/** Acepta el color propio de la categoría solo si es un HEX usable en PDF. */
function sanitizeHexColor(color: string | null | undefined): string | null {
  if (!color) return null
  const trimmed = color.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase()
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split("")
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return null
}

function safeDiv(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

/** Días calendario inclusive entre dos fechas YYYY-MM-DD. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  return Math.floor((b - a) / 86400000) + 1
}

function addDays(dateKey: string, amount: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + amount)
  return d.toISOString().slice(0, 10)
}

function dayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-")
  return `${d}/${m}`
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-")
  return `${MONTH_LABELS[Number(m) - 1] ?? m} ${y.slice(2)}`
}

function nextMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number)
  const nm = m === 12 ? 1 : m + 1
  const ny = m === 12 ? y + 1 : y
  return `${ny}-${String(nm).padStart(2, "0")}`
}

/**
 * Umbral para bucketear por día vs por mes. Hasta 45 días el detalle diario
 * sigue siendo legible en una barra de ~180mm; más allá se agrupa por mes.
 */
const MAX_DAY_BUCKETS = 45

/** Gasto con su importe ya llevado a la moneda del reporte. */
export interface ConvertedExpense extends ExpenseRow {
  /** Importe convertido a la moneda de salida. */
  convertedAmount: number
  originalAmount: number
  originalCurrency: string
  exchangeRate: number | null
}

/**
 * Lleva un gasto a la moneda de salida. Devuelve null si no se puede: sin tipo
 * de cambio no se inventa un número, el gasto se reporta aparte.
 */
function convertExpense(
  expense: ExpenseRow,
  target: string,
  getRate: (date: string | Date) => number | null
): ConvertedExpense | null {
  const original = Number(expense.amount || 0)
  const from = (expense.currency || "").toUpperCase()
  const to = (target || "").toUpperCase()

  const base: Omit<ConvertedExpense, "convertedAmount" | "exchangeRate"> = {
    ...expense,
    originalAmount: original,
    originalCurrency: from,
  }

  if (from === to) {
    return { ...base, convertedAmount: original, exchangeRate: null }
  }

  const rate = getRate(expense.movement_date)
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null

  // El TC de la tabla es siempre USD→ARS.
  if (from === "USD" && to === "ARS") {
    return { ...base, convertedAmount: roundMoney(original * rate), exchangeRate: rate }
  }
  if (from === "ARS" && to === "USD") {
    return { ...base, convertedAmount: roundMoney(original / rate), exchangeRate: rate }
  }

  // Cualquier otra combinación de monedas no está modelada.
  return null
}

/**
 * Lleva un conjunto de gastos a una sola moneda.
 *
 * Vive acá y se exporta porque lo usan DOS superficies: el reporte/PDF y la
 * pantalla de Gastos (`/api/expenses/monthly`). Cada una tenía su propio camino
 * de datos, y si la conversión se implementara dos veces volverían a mostrar
 * números distintos — que es el problema que este cambio viene a cerrar.
 */
export function convertExpensesTo(
  expenses: ExpenseRow[],
  currency: string,
  getRate?: (date: string | Date) => number | null
): { converted: ConvertedExpense[]; missingRate: ExpensesReportMissingRate[] } {
  const rateFor = getRate ?? (() => null)
  const converted: ConvertedExpense[] = []
  const missingAgg = new Map<string, { count: number; total: number }>()

  for (const e of expenses) {
    const row = convertExpense(e, currency, rateFor)
    if (!row) {
      const code = (e.currency || "?").toUpperCase()
      const prev = missingAgg.get(code)
      missingAgg.set(code, {
        count: (prev?.count || 0) + 1,
        // Su importe ORIGINAL: no hay forma de expresarlo en la moneda de
        // salida, que es justamente por lo que quedó afuera.
        total: (prev?.total || 0) + Number(e.amount || 0),
      })
      continue
    }
    converted.push(row)
  }

  const missingRate = Array.from(missingAgg.entries())
    .map(([code, g]) => ({ currency: code, count: g.count, total: roundMoney(g.total) }))
    .sort((a, b) => b.total - a.total)

  return { converted, missingRate }
}

export interface BuildExpensesReportParams {
  /** Gastos del período en TODAS las monedas. */
  expenses: ExpenseRow[]
  /** Moneda de SALIDA: todo se convierte a esta. */
  currency: string
  dateFrom: string
  dateTo: string
  /**
   * TC USD→ARS vigente para una fecha. Si no se pasa, no se convierte nada y
   * los gastos en otra moneda salen listados en `missingRate` — nunca
   * descartados en silencio.
   */
  getRate?: (date: string | Date) => number | null
}

export function buildExpensesReport({
  expenses,
  currency,
  dateFrom,
  dateTo,
  getRate,
}: BuildExpensesReportParams): ExpensesReport {
  const { converted: inCurrency, missingRate } = convertExpensesTo(expenses, currency, getRate)
  const convertedRows = inCurrency.filter((e) => e.exchangeRate != null)

  const total = inCurrency.reduce((acc, e) => acc + e.convertedAmount, 0)

  // ---- Por categoría ----
  const categoryMap = new Map<string, { total: number; count: number; color: string | null }>()
  for (const e of inCurrency) {
    const name = e.category?.trim() || UNCATEGORIZED_LABEL
    const prev = categoryMap.get(name)
    categoryMap.set(name, {
      total: (prev?.total || 0) + e.convertedAmount,
      count: (prev?.count || 0) + 1,
      color: prev?.color || sanitizeHexColor(e.category_color),
    })
  }

  // El color se asigna DESPUÉS de ordenar: la categoría usa el suyo si lo
  // tiene; si no, un tono de la paleta según su posición (de mayor a menor
  // gasto). Así la torta y la leyenda quedan siempre consistentes.
  const byCategory: ExpensesReportCategory[] = Array.from(categoryMap.entries())
    .map(([category, g]) => ({ category, ...g }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category))
    .map((row, i) => ({
      category: row.category,
      color: row.color || EXPENSE_CATEGORY_PALETTE[i % EXPENSE_CATEGORY_PALETTE.length],
      total: roundMoney(row.total),
      count: row.count,
      share: roundMoney(safeDiv(row.total, total) * 100, 1),
    }))

  const colorByCategory = new Map(byCategory.map((c) => [c.category, c.color]))

  // ---- Por tipo (fijos / variables) ----
  const typeAgg: Record<ExpenseType, { total: number; count: number }> = {
    recurring: { total: 0, count: 0 },
    variable: { total: 0, count: 0 },
  }
  for (const e of inCurrency) {
    const bucket = typeAgg[e.expense_type] ?? typeAgg.variable
    bucket.total += e.convertedAmount
    bucket.count += 1
  }
  const byType: ExpensesReportTypeRow[] = (
    [
      { type: "recurring" as const, label: "Fijos / Recurrentes" },
      { type: "variable" as const, label: "Variables" },
    ]
  ).map(({ type, label }) => ({
    type,
    label,
    total: roundMoney(typeAgg[type].total),
    count: typeAgg[type].count,
    share: roundMoney(safeDiv(typeAgg[type].total, total) * 100, 1),
  }))

  // ---- Evolución temporal ----
  const dayKeys = inCurrency.map((e) => toArgentinaDateKey(e.movement_date)).filter(Boolean)
  const rangeFrom = dateFrom || dayKeys.slice().sort()[0] || ""
  const rangeTo = dateTo || dayKeys.slice().sort().reverse()[0] || rangeFrom
  const spanDays = rangeFrom && rangeTo ? daysBetween(rangeFrom, rangeTo) : 0
  const bucketMode: "day" | "month" =
    spanDays > 0 && spanDays <= MAX_DAY_BUCKETS ? "day" : "month"

  const bucketAgg = new Map<string, { total: number; count: number }>()
  for (const e of inCurrency) {
    const dayKey = toArgentinaDateKey(e.movement_date)
    if (!dayKey) continue
    const key = bucketMode === "day" ? dayKey : dayKey.slice(0, 7)
    const prev = bucketAgg.get(key)
    bucketAgg.set(key, {
      total: (prev?.total || 0) + e.convertedAmount,
      count: (prev?.count || 0) + 1,
    })
  }

  // Rellenar huecos para que la evolución no mienta saltándose períodos vacíos.
  const bucketKeys: string[] = []
  if (rangeFrom && rangeTo) {
    if (bucketMode === "day") {
      for (let k = rangeFrom; k <= rangeTo; k = addDays(k, 1)) bucketKeys.push(k)
    } else {
      for (let k = rangeFrom.slice(0, 7); k <= rangeTo.slice(0, 7); k = nextMonth(k)) {
        bucketKeys.push(k)
      }
    }
  } else {
    bucketKeys.push(...Array.from(bucketAgg.keys()).sort())
  }

  const byBucket: ExpensesReportBucket[] = bucketKeys.map((key) => ({
    key,
    label: bucketMode === "day" ? dayLabel(key) : monthLabel(key),
    total: roundMoney(bucketAgg.get(key)?.total || 0),
    count: bucketAgg.get(key)?.count || 0,
  }))

  // ---- Por cuenta pagadora ----
  const accountAgg = new Map<string, { total: number; count: number }>()
  for (const e of inCurrency) {
    const name = e.financial_accounts?.name?.trim() || "Sin cuenta"
    const prev = accountAgg.get(name)
    accountAgg.set(name, {
      total: (prev?.total || 0) + e.convertedAmount,
      count: (prev?.count || 0) + 1,
    })
  }
  const byAccount: ExpensesReportAccount[] = Array.from(accountAgg.entries())
    .map(([account, g]) => ({ account, total: roundMoney(g.total), count: g.count }))
    .sort((a, b) => b.total - a.total || a.account.localeCompare(b.account))

  // ---- Detalle ----
  const detail: ExpensesReportDetailRow[] = inCurrency.map((e) => {
    const category = e.category?.trim() || UNCATEGORIZED_LABEL
    return {
      id: e.id,
      date: toArgentinaDateKey(e.movement_date),
      description: e.description?.trim() || category,
      category,
      categoryColor: colorByCategory.get(category) || EXPENSE_CATEGORY_PALETTE[0],
      type: e.expense_type,
      account: e.financial_accounts?.name?.trim() || "-",
      user: e.users?.name?.trim() || "-",
      amount: roundMoney(e.convertedAmount),
      originalAmount: roundMoney(e.originalAmount),
      originalCurrency: e.originalCurrency,
      exchangeRate: e.exchangeRate,
    }
  })

  return {
    currency,
    dateFrom: rangeFrom,
    dateTo: rangeTo,
    summary: {
      total: roundMoney(total),
      count: inCurrency.length,
      average: roundMoney(safeDiv(total, inCurrency.length)),
      dailyAverage: roundMoney(safeDiv(total, spanDays)),
      days: spanDays,
      topCategory: byCategory[0]
        ? {
            category: byCategory[0].category,
            total: byCategory[0].total,
            share: byCategory[0].share,
          }
        : null,
      converted: convertedRows.length
        ? {
            count: convertedRows.length,
            total: roundMoney(
              convertedRows.reduce((acc, e) => acc + e.convertedAmount, 0)
            ),
          }
        : null,
      missingRate,
    },
    byCategory,
    byType,
    byBucket,
    bucketMode,
    byAccount,
    detail,
  }
}
