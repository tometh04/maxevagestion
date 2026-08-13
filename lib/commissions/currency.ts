/**
 * Moneda de una comisión, en un solo lugar.
 *
 * `commission_records` NO tiene columna de moneda: el `amount` está en la
 * moneda de venta de la operación. Cada pantalla que quiera totalizar
 * comisiones tiene que derivarla, y si cada una lo hace a su manera terminan
 * mostrando números distintos.
 *
 * Regla dura: ARS y USD nunca se suman entre sí. Sumarlas da un número que no
 * significa nada y que además se muestra con un símbolo que miente.
 */

export type CommissionCurrency = "ARS" | "USD"

export interface CommissionLike {
  amount: number
  operation?: { currency?: string | null; sale_currency?: string | null } | null
}

export interface AmountsByCurrency {
  ARS: number
  USD: number
}

export interface CommissionTotalsByCurrency {
  ARS: { pending: number; paid: number; total: number; count: number }
  USD: { pending: number; paid: number; total: number; count: number }
}

export function emptyAmountsByCurrency(): AmountsByCurrency {
  return { ARS: 0, USD: 0 }
}

export function emptyTotalsByCurrency(): CommissionTotalsByCurrency {
  return {
    ARS: { pending: 0, paid: 0, total: 0, count: 0 },
    USD: { pending: 0, paid: 0, total: 0, count: 0 },
  }
}

/** Default USD: es lo que venía asumiendo la UI de comisiones. */
export function getCommissionCurrency(commission: CommissionLike): CommissionCurrency {
  const raw = commission.operation?.currency || commission.operation?.sale_currency || "USD"
  return raw === "ARS" ? "ARS" : "USD"
}

/** Suma montos separados por moneda. */
export function sumByCurrency(commissions: CommissionLike[]): AmountsByCurrency {
  const totals = emptyAmountsByCurrency()
  for (const commission of commissions) {
    totals[getCommissionCurrency(commission)] += Number(commission.amount) || 0
  }
  return totals
}

/** Pendiente / pagado / total, separados por moneda. */
export function totalsByCurrency(
  commissions: Array<CommissionLike & { status?: string }>
): CommissionTotalsByCurrency {
  const totals = emptyTotalsByCurrency()
  for (const commission of commissions) {
    const bucket = totals[getCommissionCurrency(commission)]
    const amount = Number(commission.amount) || 0
    bucket.total += amount
    bucket.count += 1
    if (String(commission.status).toUpperCase() === "PAID") bucket.paid += amount
    else bucket.pending += amount
  }
  return totals
}

/** true si en esa moneda no hay nada que mostrar. */
export function isEmptyBucket(bucket: { total: number; count: number }): boolean {
  return bucket.count === 0 && bucket.total === 0
}
