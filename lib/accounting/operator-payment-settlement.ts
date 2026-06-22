import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

type AppSupabaseClient = SupabaseClient<Database>

export type OpenOperatorPaymentStatus = "PENDING" | "OVERDUE"

export interface OperatorPaymentRecord {
  id: string
  operation_id: string | null
  operator_id: string
  amount: number | string
  paid_amount: number | string | null
  due_date: string | null
  status: "PENDING" | "PAID" | "OVERDUE"
  ledger_movement_id: string | null
  created_at?: string | null
}

const MONEY_EPSILON = 0.005

function toMoney(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function normalizeDate(date: Date): Date {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function parseDateOnly(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number)
    return new Date(year, month - 1, day)
  }

  return new Date(value)
}

export function getOpenOperatorPaymentStatus(
  dueDate: string | null | undefined,
  today = new Date()
): OpenOperatorPaymentStatus {
  if (!dueDate) {
    return "PENDING"
  }

  const due = normalizeDate(parseDateOnly(dueDate))
  const current = normalizeDate(today)

  return due < current ? "OVERDUE" : "PENDING"
}

export function hasPendingBalance(operatorPayment: Pick<OperatorPaymentRecord, "amount" | "paid_amount">): boolean {
  return toMoney(operatorPayment.paid_amount) + MONEY_EPSILON < toMoney(operatorPayment.amount)
}

export function getEffectiveOperatorPaymentStatus(
  operatorPayment: Pick<OperatorPaymentRecord, "amount" | "paid_amount" | "due_date">
): OperatorPaymentRecord["status"] {
  return hasPendingBalance(operatorPayment)
    ? getOpenOperatorPaymentStatus(operatorPayment.due_date)
    : "PAID"
}

export function buildOperatorPaymentUpdate(
  operatorPayment: Pick<OperatorPaymentRecord, "amount" | "paid_amount" | "due_date">,
  paymentDelta: number,
  ledgerMovementId: string | null
) {
  const currentPaid = toMoney(operatorPayment.paid_amount)
  const totalAmount = toMoney(operatorPayment.amount)
  // Tope en [0, totalAmount]: evita que un pago cree sobrepago (paid_amount > amount)
  // o saldo negativo (paid_amount < 0 por reverso mayor al pagado).
  const rawNextPaid = currentPaid + paymentDelta
  const nextPaidAmount = roundMoney(Math.min(totalAmount, Math.max(0, rawNextPaid)))
  const fullyPaid = nextPaidAmount + MONEY_EPSILON >= totalAmount

  return {
    paid_amount: nextPaidAmount,
    status: fullyPaid ? "PAID" as const : getOpenOperatorPaymentStatus(operatorPayment.due_date),
    ledger_movement_id: fullyPaid ? ledgerMovementId : null,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Desambigua entre varias patas pendientes del MISMO operador usando el monto
 * del pago.
 *
 * Caso real (OP b62d751c, 2026-06): un operador (FTA TOUR OPERADOR) aparecía en
 * 2 patas de la misma operación — Hotel 332,64 y Vuelo 399,44. Al registrar un
 * pago de 399,44 sin operator_payment_id explícito, el matching tomaba la pata
 * MÁS VIEJA (FIFO) → la del hotel, topeaba el pago a 332,64 y descartaba el
 * excedente, dejando el vuelo como pendiente fantasma.
 *
 * Estrategia conservadora: solo desvía del orden FIFO si existe UNA ÚNICA pata
 * cuyo saldo pendiente coincide EXACTAMENTE (± epsilon) con el monto del pago.
 * Si no hay match, o hay más de uno (ambiguo), devuelve null y el caller mantiene
 * el comportamiento FIFO previo. Así no cambia ningún flujo existente salvo el
 * que justamente estaba mal.
 */
export function pickExactPendingMatch<
  T extends { amount: number | string; paid_amount: number | string | null }
>(candidates: T[], amount: number | string | null | undefined): T | null {
  if (amount == null) return null
  const target = Number(amount)
  if (!Number.isFinite(target) || target <= 0) return null

  const matches = candidates.filter(
    (c) => Math.abs(toMoney(c.amount) - toMoney(c.paid_amount) - target) <= MONEY_EPSILON
  )

  return matches.length === 1 ? matches[0] : null
}

export async function findMatchingOperatorPayment(
  supabase: AppSupabaseClient,
  params: {
    operationId: string
    operatorId?: string | null
    operatorPaymentId?: string | null
    /**
     * Monto del pago. Cuando se conoce y hay varias patas pendientes del mismo
     * operador, se usa para elegir la pata exacta en vez del orden FIFO ciego.
     */
    amount?: number | string | null
  }
): Promise<OperatorPaymentRecord | null> {
  const baseSelect = "id, operation_id, operator_id, amount, paid_amount, due_date, status, ledger_movement_id, created_at"

  if (params.operatorPaymentId) {
    const { data, error } = await (supabase.from("operator_payments") as any)
      .select(baseSelect)
      .eq("id", params.operatorPaymentId)
      .maybeSingle()

    if (error) {
      throw new Error(`Error obteniendo deuda de operador: ${error.message}`)
    }

    const operatorPayment = data as OperatorPaymentRecord | null
    if (!operatorPayment) {
      return null
    }

    if (operatorPayment.operation_id !== params.operationId) {
      throw new Error("La deuda seleccionada no pertenece a la operación")
    }

    if (params.operatorId && operatorPayment.operator_id !== params.operatorId) {
      throw new Error("La deuda seleccionada no corresponde al operador elegido")
    }

    return hasPendingBalance(operatorPayment) ? operatorPayment : null
  }

  let query = (supabase.from("operator_payments") as any)
    .select(baseSelect)
    .eq("operation_id", params.operationId)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: true })

  if (params.operatorId) {
    query = query.eq("operator_id", params.operatorId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Error obteniendo deuda de operador: ${error.message}`)
  }

  const candidates = ((data as OperatorPaymentRecord[] | null) || []).filter(hasPendingBalance)

  if (!params.operatorId && candidates.length !== 1) {
    return null
  }

  // Varias patas pendientes del mismo operador: preferir la que matchea el monto
  // exacto del pago antes de caer al FIFO (ver pickExactPendingMatch).
  if (candidates.length > 1) {
    const exact = pickExactPendingMatch(candidates, params.amount)
    if (exact) {
      return exact
    }
  }

  return candidates[0] || null
}

export async function applyOperatorPaymentSettlement(
  supabase: AppSupabaseClient,
  operatorPaymentId: string,
  paymentAmount: number,
  ledgerMovementId: string | null
) {
  const { data, error } = await (supabase.from("operator_payments") as any)
    .select("id, amount, paid_amount, due_date")
    .eq("id", operatorPaymentId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || "No se encontró la deuda del operador")
  }

  const updateData = buildOperatorPaymentUpdate(data as OperatorPaymentRecord, paymentAmount, ledgerMovementId)

  const { error: updateError } = await (supabase.from("operator_payments") as any)
    .update(updateData)
    .eq("id", operatorPaymentId)

  if (updateError) {
    throw new Error(`Error actualizando deuda de operador: ${updateError.message}`)
  }

  return updateData
}

export async function revertOperatorPaymentSettlement(
  supabase: AppSupabaseClient,
  params: {
    operatorPaymentId: string
    paymentAmount: number
    currentPaymentId?: string | null
    removedLedgerMovementId?: string | null
  }
) {
  const { data, error } = await (supabase.from("operator_payments") as any)
    .select("id, amount, paid_amount, due_date, ledger_movement_id")
    .eq("id", params.operatorPaymentId)
    .single()

  if (error || !data) {
    throw new Error(error?.message || "No se encontró la deuda del operador")
  }

  const draftUpdate = buildOperatorPaymentUpdate(
    data as OperatorPaymentRecord,
    -Math.abs(params.paymentAmount),
    null
  )

  let ledgerMovementId: string | null = draftUpdate.ledger_movement_id

  if (draftUpdate.status === "PAID") {
    if (
      params.removedLedgerMovementId &&
      (data as OperatorPaymentRecord).ledger_movement_id === params.removedLedgerMovementId
    ) {
      let replacementQuery = (supabase.from("payments") as any)
        .select("id, ledger_movement_id")
        .eq("operator_payment_id", params.operatorPaymentId)
        .eq("status", "PAID")
        .not("ledger_movement_id", "is", null)
        .order("date_paid", { ascending: false })
        .order("created_at", { ascending: false })

      if (params.currentPaymentId) {
        replacementQuery = replacementQuery.neq("id", params.currentPaymentId)
      }

      const { data: replacement } = await replacementQuery.limit(1).maybeSingle()
      ledgerMovementId = replacement?.ledger_movement_id || null
    } else {
      ledgerMovementId = (data as OperatorPaymentRecord).ledger_movement_id
    }
  }

  const finalUpdate = {
    ...draftUpdate,
    ledger_movement_id: ledgerMovementId,
  }

  const { error: updateError } = await (supabase.from("operator_payments") as any)
    .update(finalUpdate)
    .eq("id", params.operatorPaymentId)

  if (updateError) {
    throw new Error(`Error revirtiendo deuda de operador: ${updateError.message}`)
  }

  return finalUpdate
}
