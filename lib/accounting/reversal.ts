export type MovementType = "INCOME" | "EXPENSE"

export function oppositeMovementType(type: MovementType): MovementType {
  return type === "INCOME" ? "EXPENSE" : "INCOME"
}

export type ReversalCheckResult = { ok: true } | { ok: false; error: string }

export function canReverse(movement: {
  reversed_at?: string | null
  reverses_movement_id?: string | null
}): ReversalCheckResult {
  if (movement.reversed_at) {
    return { ok: false, error: "Este movimiento ya fue reversado" }
  }
  if (movement.reverses_movement_id) {
    return { ok: false, error: "No se puede reversar una reversión" }
  }
  return { ok: true }
}

/**
 * Build payload for reversing a cash_movements row.
 * Schema: type, category, amount, currency, movement_date, notes,
 *         financial_account_id, operation_id, user_id, org_id.
 * NO agency_id (cash_movements no tiene esa columna).
 */
export function buildCashReversalPayload<M extends {
  type: string
  amount: number
  currency: string
  financial_account_id: string | null
  operation_id?: string | null
  user_id?: string | null
  org_id?: string | null
}>(original: M, reason: string, originalId: string, todayIso: string): Record<string, any> {
  return {
    type: oppositeMovementType(original.type as MovementType),
    amount: original.amount,
    currency: original.currency,
    financial_account_id: original.financial_account_id,
    operation_id: original.operation_id ?? null,
    user_id: original.user_id ?? null,
    org_id: original.org_id ?? null,
    category: "Contra-movimiento",
    notes: `Reversión de ${originalId}: ${reason}`,
    movement_date: todayIso,
    reverses_movement_id: originalId,
  }
}

/**
 * Build payload for reversing a ledger_movements row.
 * Schema completamente distinto a cash_movements:
 *   type (más enum values), concept, notes, currency, amount_original,
 *   amount_ars_equivalent, exchange_rate, method, account_id,
 *   operation_id, lead_id, seller_id, operator_id, org_id, created_by.
 *
 * Solo soporta INCOME/EXPENSE en v1. Otros tipos (FX_GAIN, FX_LOSS,
 * COMMISSION, OPERATOR_PAYMENT) se rechazan en el endpoint.
 */
export function buildLedgerReversalPayload<M extends {
  type: string
  concept?: string | null
  currency: string
  amount_original: number
  amount_ars_equivalent: number
  exchange_rate?: number | null
  method: string
  account_id?: string | null
  operation_id?: string | null
  lead_id?: string | null
  seller_id?: string | null
  operator_id?: string | null
  org_id?: string | null
  created_by?: string | null
}>(original: M, reason: string, originalId: string, _todayIso: string): Record<string, any> {
  return {
    type: oppositeMovementType(original.type as MovementType),
    concept: "Contra-movimiento",
    notes: `Reversión de ${originalId}: ${reason}`,
    currency: original.currency,
    amount_original: original.amount_original,
    amount_ars_equivalent: original.amount_ars_equivalent,
    exchange_rate: original.exchange_rate ?? null,
    method: original.method,
    account_id: original.account_id ?? null,
    operation_id: original.operation_id ?? null,
    lead_id: original.lead_id ?? null,
    seller_id: original.seller_id ?? null,
    operator_id: original.operator_id ?? null,
    org_id: original.org_id ?? null,
    created_by: original.created_by ?? null,
    reverses_movement_id: originalId,
  }
}

/**
 * @deprecated Usar buildCashReversalPayload o buildLedgerReversalPayload.
 * Conservado para tests existentes — wrapper sobre buildCashReversalPayload.
 */
export const buildReversalPayload = buildCashReversalPayload
