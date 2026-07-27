/**
 * Agregación del Reporte de Caja y flujo proyectado (VIB-67).
 *
 * Función pura: recibe cobranzas, pagos y saldos ya leídos por `lib/cashflow/*`
 * y arma los tramos de vencimiento y la proyección.
 *
 * Reglas duras:
 *  - ARS y USD corren en paralelo y NUNCA se suman. No se puede cancelar una
 *    deuda en pesos con dólares, así que cada monto es un par {ARS, USD} y la
 *    proyección son dos saldos acumulados independientes.
 *  - El "hoy" y los vencimientos se comparan como strings YYYY-MM-DD en hora
 *    argentina. Comparar objetos Date arrastra la zona horaria del servidor
 *    (UTC en Railway) y hace que un vencimiento de hoy figure como vencido.
 *  - Lo que no tiene fecha va a un tramo propio ("Sin fecha") y queda FUERA de
 *    la proyección: no se puede ubicar en el tiempo, pero tampoco se puede
 *    desaparecer del reporte.
 */

import { roundMoney } from "@/lib/currency"
import { daysDiff } from "@/lib/reports/period"
import type { ReceivableRow } from "@/lib/cashflow/fetch-receivables"
import type { PayableRow } from "@/lib/cashflow/fetch-payables"
import type { AccountBalanceRow } from "@/lib/cashflow/fetch-account-balances"

export interface CashflowAmounts {
  ARS: number
  USD: number
}

/**
 * Los conteos también van por moneda: el bloque de dólares tiene que decir
 * cuántas cobranzas en dólares hay, no cuántas hay en total.
 */
export type CashflowCounts = CashflowAmounts

export interface CashflowBucketSpec {
  key: string
  label: string
  /** Días desde hoy, inclusive. null = sin piso (vencidas) o sin techo. */
  fromDay: number | null
  toDay: number | null
}

export interface CashflowBucket {
  key: string
  label: string
  receivable: CashflowAmounts
  receivableCount: CashflowCounts
  payable: CashflowAmounts
  payableCount: CashflowCounts
  net: CashflowAmounts
}

export interface CashflowProjectionPoint {
  bucketKey: string
  label: string
  opening: CashflowAmounts
  inflow: CashflowAmounts
  outflow: CashflowAmounts
  closing: CashflowAmounts
}

export interface CashflowReceivableDetail extends ReceivableRow {
  bucketKey: string
  /** Días de atraso; 0 o negativo si todavía no venció. */
  daysOverdue: number
}

export interface CashflowPayableDetail extends PayableRow {
  bucketKey: string
  daysOverdue: number
}

export interface CashflowProjectionReport {
  today: string
  tramos: number[]
  buckets: CashflowBucket[]
  balances: {
    byAccount: AccountBalanceRow[]
    totals: CashflowAmounts
  }
  projection: CashflowProjectionPoint[]
  summary: {
    overdueReceivable: CashflowAmounts
    overdueReceivableCount: CashflowCounts
    overduePayable: CashflowAmounts
    overduePayableCount: CashflowCounts
    totalReceivable: CashflowAmounts
    totalPayable: CashflowAmounts
    /** Neto de lo que entra menos lo que sale dentro del horizonte. */
    horizonNet: CashflowAmounts
    noDateReceivable: CashflowAmounts
    noDatePayable: CashflowAmounts
    /** Primer tramo con saldo proyectado negativo, por moneda. */
    firstShortfall: { ARS: string | null; USD: string | null }
    truncated: boolean
  }
  dueDateSource: { fromPaymentDeadline: number; fromDepartureDate: number; missing: number }
  receivables: CashflowReceivableDetail[]
  payables: CashflowPayableDetail[]
}

export const OVERDUE_KEY = "OVERDUE"
export const BEYOND_KEY = "BEYOND"
export const NO_DATE_KEY = "NO_DATE"

export const DEFAULT_TRAMOS = [7, 15, 30]
const MAX_TRAMOS = 6

function emptyAmounts(): CashflowAmounts {
  return { ARS: 0, USD: 0 }
}

function currencyKey(currency: string): keyof CashflowAmounts {
  return currency === "USD" ? "USD" : "ARS"
}

/**
 * Normaliza los tramos elegidos por el usuario: enteros positivos, ascendentes,
 * sin repetidos y como mucho `MAX_TRAMOS`.
 */
export function normalizeTramos(input: number[] | null | undefined): number[] {
  const clean = Array.from(
    new Set(
      (input ?? DEFAULT_TRAMOS)
        .map((n) => Math.floor(Number(n)))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 3650)
    )
  ).sort((a, b) => a - b)
  return clean.length > 0 ? clean.slice(0, MAX_TRAMOS) : DEFAULT_TRAMOS
}

/**
 * Tramos exhaustivos y disjuntos: vencidas, un tramo por corte, el resto y sin
 * fecha. Todo vencimiento cae en exactamente uno.
 */
export function buildBucketSpecs(tramos: number[]): CashflowBucketSpec[] {
  const cuts = normalizeTramos(tramos)
  const specs: CashflowBucketSpec[] = [
    { key: OVERDUE_KEY, label: "Vencidas", fromDay: null, toDay: -1 },
  ]

  let previous = 0
  for (const cut of cuts) {
    specs.push({
      key: `D${previous}_${cut}`,
      label: previous === 0 ? `0 a ${cut} días` : `${previous + 1} a ${cut} días`,
      fromDay: previous,
      toDay: cut,
    })
    previous = cut
  }

  specs.push({
    key: BEYOND_KEY,
    label: `Más de ${previous} días`,
    fromDay: previous + 1,
    toDay: null,
  })
  specs.push({ key: NO_DATE_KEY, label: "Sin fecha", fromDay: null, toDay: null })

  return specs
}

/**
 * Tramo al que pertenece un vencimiento. `today` y `dueDate` son YYYY-MM-DD.
 * Un vencimiento de HOY no está vencido: entra en el primer tramo.
 */
export function bucketOf(
  dueDate: string | null,
  today: string,
  specs: CashflowBucketSpec[]
): string {
  if (!dueDate) return NO_DATE_KEY
  const days = daysDiff(today, dueDate)
  if (days < 0) return OVERDUE_KEY
  for (const spec of specs) {
    if (spec.key === OVERDUE_KEY || spec.key === NO_DATE_KEY) continue
    const from = spec.fromDay ?? 0
    const to = spec.toDay
    if (days >= from && (to == null || days <= to)) return spec.key
  }
  return BEYOND_KEY
}

export interface BuildCashflowProjectionReportParams {
  receivables: ReceivableRow[]
  payables: PayableRow[]
  balances: { accounts: AccountBalanceRow[]; totals: CashflowAmounts }
  dueDateSource: { fromPaymentDeadline: number; fromDepartureDate: number; missing: number }
  today: string
  tramos?: number[]
  truncated?: boolean
}

export function buildCashflowProjectionReport({
  receivables,
  payables,
  balances,
  dueDateSource,
  today,
  tramos,
  truncated = false,
}: BuildCashflowProjectionReportParams): CashflowProjectionReport {
  const cuts = normalizeTramos(tramos)
  const specs = buildBucketSpecs(cuts)

  const bucketAcc = new Map<
    string,
    {
      receivable: CashflowAmounts
      receivableCount: CashflowCounts
      payable: CashflowAmounts
      payableCount: CashflowCounts
    }
  >()
  for (const spec of specs) {
    bucketAcc.set(spec.key, {
      receivable: emptyAmounts(),
      receivableCount: emptyAmounts(),
      payable: emptyAmounts(),
      payableCount: emptyAmounts(),
    })
  }

  const receivableDetail: CashflowReceivableDetail[] = receivables.map((row) => {
    const bucketKey = bucketOf(row.dueDate, today, specs)
    const acc = bucketAcc.get(bucketKey)!
    const cur = currencyKey(row.currency)
    acc.receivable[cur] = roundMoney(acc.receivable[cur] + row.debt)
    acc.receivableCount[cur]++
    return {
      ...row,
      debt: roundMoney(row.debt),
      saleAmount: roundMoney(row.saleAmount),
      paid: roundMoney(row.paid),
      bucketKey,
      daysOverdue: row.dueDate ? -daysDiff(today, row.dueDate) : 0,
    }
  })

  const payableDetail: CashflowPayableDetail[] = payables.map((row) => {
    const bucketKey = bucketOf(row.dueDate, today, specs)
    const acc = bucketAcc.get(bucketKey)!
    const cur = currencyKey(row.currency)
    acc.payable[cur] = roundMoney(acc.payable[cur] + row.pending)
    acc.payableCount[cur]++
    return {
      ...row,
      pending: roundMoney(row.pending),
      bucketKey,
      daysOverdue: row.dueDate ? -daysDiff(today, row.dueDate) : 0,
    }
  })

  const buckets: CashflowBucket[] = specs.map((spec) => {
    const acc = bucketAcc.get(spec.key)!
    return {
      key: spec.key,
      label: spec.label,
      receivable: acc.receivable,
      receivableCount: acc.receivableCount,
      payable: acc.payable,
      payableCount: acc.payableCount,
      net: {
        ARS: roundMoney(acc.receivable.ARS - acc.payable.ARS),
        USD: roundMoney(acc.receivable.USD - acc.payable.USD),
      },
    }
  })

  // ---- Proyección ----
  // Escenario: todo se cobra y se paga en su fecha de vencimiento. Lo vencido
  // entra en el primer tramo (se asume cobrable/pagable ya). "Sin fecha" no
  // participa: no se puede ubicar en el tiempo.
  const projection: CashflowProjectionPoint[] = []
  let runningArs = balances.totals.ARS
  let runningUsd = balances.totals.USD
  const firstShortfall: { ARS: string | null; USD: string | null } = { ARS: null, USD: null }

  for (const bucket of buckets) {
    if (bucket.key === NO_DATE_KEY) continue
    const opening = { ARS: roundMoney(runningArs), USD: roundMoney(runningUsd) }
    runningArs = runningArs + bucket.receivable.ARS - bucket.payable.ARS
    runningUsd = runningUsd + bucket.receivable.USD - bucket.payable.USD
    const closing = { ARS: roundMoney(runningArs), USD: roundMoney(runningUsd) }

    if (firstShortfall.ARS === null && closing.ARS < 0) firstShortfall.ARS = bucket.key
    if (firstShortfall.USD === null && closing.USD < 0) firstShortfall.USD = bucket.key

    projection.push({
      bucketKey: bucket.key,
      label: bucket.label,
      opening,
      inflow: bucket.receivable,
      outflow: bucket.payable,
      closing,
    })
  }

  const sumAmounts = (rows: CashflowBucket[], pick: (b: CashflowBucket) => CashflowAmounts) =>
    rows.reduce(
      (acc, b) => ({
        ARS: roundMoney(acc.ARS + pick(b).ARS),
        USD: roundMoney(acc.USD + pick(b).USD),
      }),
      emptyAmounts()
    )

  const overdue = buckets.find((b) => b.key === OVERDUE_KEY)!
  const noDate = buckets.find((b) => b.key === NO_DATE_KEY)!
  const inHorizon = buckets.filter((b) => b.key !== NO_DATE_KEY)

  const totalReceivable = sumAmounts(buckets, (b) => b.receivable)
  const totalPayable = sumAmounts(buckets, (b) => b.payable)
  const horizonReceivable = sumAmounts(inHorizon, (b) => b.receivable)
  const horizonPayable = sumAmounts(inHorizon, (b) => b.payable)

  return {
    today,
    tramos: cuts,
    buckets,
    balances: { byAccount: balances.accounts, totals: balances.totals },
    projection,
    summary: {
      overdueReceivable: overdue.receivable,
      overdueReceivableCount: overdue.receivableCount,
      overduePayable: overdue.payable,
      overduePayableCount: overdue.payableCount,
      totalReceivable,
      totalPayable,
      horizonNet: {
        ARS: roundMoney(horizonReceivable.ARS - horizonPayable.ARS),
        USD: roundMoney(horizonReceivable.USD - horizonPayable.USD),
      },
      noDateReceivable: noDate.receivable,
      noDatePayable: noDate.payable,
      firstShortfall,
      truncated,
    },
    dueDateSource,
    receivables: receivableDetail.sort(
      (a, b) => b.daysOverdue - a.daysOverdue || b.debt - a.debt
    ),
    payables: payableDetail.sort(
      (a, b) => b.daysOverdue - a.daysOverdue || b.pending - a.pending
    ),
  }
}
