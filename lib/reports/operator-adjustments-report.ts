/**
 * Reporte de ajustes de liquidación de operador (VIB-174).
 *
 * "Que en algún lugar queden todos estos ajustes, así a fin de mes vamos a
 * poder contabilizarlos, sean ganancias o pérdidas."
 *
 * Agregación pura, sin base de datos. Dos reglas que no se negocian:
 *
 *   1. **ARS y USD nunca se suman.** Es la misma regla del reporte de
 *      comisiones y del societario: un total mezclado no significa nada y
 *      además se muestra con un símbolo que miente.
 *   2. **Se totaliza el RESULTADO, no el delta de costo.** El delta dice cuánto
 *      cambió el costo; el resultado dice cuánto ganó o perdió la agencia, que
 *      es el signo con el que esto entra al mes. result = −delta.
 */

export interface AdjustmentSellerShareRow {
  sellerId: string
  sellerName: string | null
  amount: number
}

export interface OperatorAdjustmentRow {
  id: string
  accrualDate: string
  createdAt: string | null
  operationId: string | null
  operationFileCode: string | null
  operatorId: string | null
  operatorName: string | null
  agencyId: string | null
  agencyName: string | null
  currency: "ARS" | "USD"
  estimatedAmount: number
  actualAmount: number
  /** actual − estimado. Positivo = el operador cobró más. */
  deltaAmount: number
  /** −delta. Positivo = ganancia para la agencia. */
  resultAmount: number
  agencyShare: number
  referrerShare: number
  sellerShares: AdjustmentSellerShareRow[]
  reason: string
  reversedAt: string | null
}

export interface OperatorAdjustmentTotals {
  currency: "ARS" | "USD"
  count: number
  /** Suma de los resultados positivos. */
  gain: number
  /** Suma de los resultados negativos (queda negativa). */
  loss: number
  /** gain + loss. */
  net: number
  agency: number
  sellers: number
  referrer: number
}

export interface OperatorAdjustmentGroup {
  key: string
  label: string
  currency: "ARS" | "USD"
  count: number
  net: number
}

export interface OperatorAdjustmentsReport {
  rows: OperatorAdjustmentRow[]
  totals: OperatorAdjustmentTotals[]
  byAgency: OperatorAdjustmentGroup[]
  bySeller: OperatorAdjustmentGroup[]
  byOperator: OperatorAdjustmentGroup[]
  /** Ajustes revertidos: se informan aparte, no se totalizan. */
  reversedCount: number
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function emptyTotals(currency: "ARS" | "USD"): OperatorAdjustmentTotals {
  return { currency, count: 0, gain: 0, loss: 0, net: 0, agency: 0, sellers: 0, referrer: 0 }
}

/**
 * Arma el reporte. Los ajustes revertidos entran en `rows` —hay que poder
 * verlos— pero NO suman en ningún total: se revirtieron justamente porque no
 * debían impactar.
 */
export function buildOperatorAdjustmentsReport(
  rows: OperatorAdjustmentRow[],
): OperatorAdjustmentsReport {
  const totals = new Map<string, OperatorAdjustmentTotals>()
  const byAgency = new Map<string, OperatorAdjustmentGroup>()
  const bySeller = new Map<string, OperatorAdjustmentGroup>()
  const byOperator = new Map<string, OperatorAdjustmentGroup>()

  let reversedCount = 0

  const bump = (
    map: Map<string, OperatorAdjustmentGroup>,
    key: string,
    label: string,
    currency: "ARS" | "USD",
    amount: number,
  ) => {
    const mapKey = `${key}::${currency}`
    const current = map.get(mapKey) ?? { key, label, currency, count: 0, net: 0 }
    current.count += 1
    current.net = round2(current.net + amount)
    map.set(mapKey, current)
  }

  for (const row of rows) {
    if (row.reversedAt) {
      reversedCount += 1
      continue
    }

    const bucket = totals.get(row.currency) ?? emptyTotals(row.currency)
    const result = row.resultAmount

    bucket.count += 1
    if (result > 0) bucket.gain = round2(bucket.gain + result)
    else bucket.loss = round2(bucket.loss + result)
    bucket.net = round2(bucket.gain + bucket.loss)
    bucket.agency = round2(bucket.agency + row.agencyShare)
    bucket.referrer = round2(bucket.referrer + row.referrerShare)
    bucket.sellers = round2(
      bucket.sellers + row.sellerShares.reduce((sum, s) => sum + s.amount, 0),
    )
    totals.set(row.currency, bucket)

    bump(
      byAgency,
      row.agencyId ?? "SIN_OFICINA",
      row.agencyName ?? "Sin oficina",
      row.currency,
      row.agencyShare,
    )

    bump(
      byOperator,
      row.operatorId ?? "SIN_OPERADOR",
      row.operatorName ?? "Sin operador",
      row.currency,
      result,
    )

    for (const share of row.sellerShares) {
      bump(bySeller, share.sellerId, share.sellerName ?? "Vendedor", row.currency, share.amount)
    }
  }

  const byNetDesc = (a: OperatorAdjustmentGroup, b: OperatorAdjustmentGroup) =>
    Math.abs(b.net) - Math.abs(a.net)

  return {
    rows,
    // USD primero: es la moneda en la que se opera la mayoría de los paquetes.
    totals: Array.from(totals.values()).sort((a, b) => (a.currency === "USD" ? -1 : 1)),
    byAgency: Array.from(byAgency.values()).sort(byNetDesc),
    bySeller: Array.from(bySeller.values()).sort(byNetDesc),
    byOperator: Array.from(byOperator.values()).sort(byNetDesc),
    reversedCount,
  }
}

/** Normaliza una fila cruda de `operator_cost_adjustments` (con sus joins). */
export function toAdjustmentRow(raw: any): OperatorAdjustmentRow {
  const delta = round2(Number(raw.delta_amount ?? 0))

  return {
    id: raw.id,
    accrualDate: raw.accrual_date,
    createdAt: raw.created_at ?? null,
    operationId: raw.operation_id ?? null,
    operationFileCode: raw.operations?.file_code ?? null,
    operatorId: raw.operator_id ?? null,
    operatorName: raw.operators?.name ?? raw.operator_name ?? null,
    agencyId: raw.agency_id ?? null,
    agencyName: raw.agencies?.name ?? null,
    currency: (raw.currency ?? "ARS") as "ARS" | "USD",
    estimatedAmount: round2(Number(raw.estimated_amount ?? 0)),
    actualAmount: round2(Number(raw.actual_amount ?? 0)),
    deltaAmount: delta,
    resultAmount: round2(-delta),
    agencyShare: round2(Number(raw.agency_share_amount ?? 0)),
    referrerShare: round2(Number(raw.referrer_share_amount ?? 0)),
    sellerShares: Array.isArray(raw.seller_shares)
      ? raw.seller_shares.map((s: any) => ({
          sellerId: s.seller_id,
          sellerName: s.seller_name ?? null,
          amount: round2(Number(s.amount ?? 0)),
        }))
      : [],
    reason: raw.reason ?? "",
    reversedAt: raw.reversed_at ?? null,
  }
}
