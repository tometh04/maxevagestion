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

export function buildReversalPayload<M extends {
  type: string
  amount: number
  currency: string
  financial_account_id: string | null
  agency_id?: string | null
  org_id?: string | null
  operation_id?: string | null
  user_id?: string | null
}>(original: M, reason: string, originalId: string, todayIso: string): Record<string, any> {
  return {
    type: oppositeMovementType(original.type as MovementType),
    amount: original.amount,
    currency: original.currency,
    financial_account_id: original.financial_account_id,
    agency_id: original.agency_id ?? null,
    org_id: original.org_id ?? null,
    operation_id: original.operation_id ?? null,
    user_id: original.user_id ?? null,
    category: "Contra-movimiento",
    notes: `Reversión de ${originalId}: ${reason}`,
    movement_date: todayIso,
    reverses_movement_id: originalId,
  }
}
