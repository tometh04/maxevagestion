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

export function buildOperatorPaymentUpdate(
  operatorPayment: Pick<OperatorPaymentRecord, "amount" | "paid_amount" | "due_date">,
  paymentDelta: number,
  ledgerMovementId: string | null
) {
  const currentPaid = toMoney(operatorPayment.paid_amount)
  const totalAmount = toMoney(operatorPayment.amount)
  const nextPaidAmount = roundMoney(Math.max(0, currentPaid + paymentDelta))
  const fullyPaid = nextPaidAmount + MONEY_EPSILON >= totalAmount

  return {
    paid_amount: nextPaidAmount,
    status: fullyPaid ? "PAID" as const : getOpenOperatorPaymentStatus(operatorPayment.due_date),
    ledger_movement_id: fullyPaid ? ledgerMovementId : null,
    updated_at: new Date().toISOString(),
  }
}

export async function findMatchingOperatorPayment(
  supabase: AppSupabaseClient,
  params: {
    operationId: string
    operatorId?: string | null
    operatorPaymentId?: string | null
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
    .in("status", ["PENDING", "OVERDUE"])
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
