/**
 * OPERATOR PAYMENTS SERVICE
 * 
 * Este servicio maneja la creación y gestión de pagos a operadores.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export type OperatorPaymentStatus = "PENDING" | "PAID" | "OVERDUE"

/**
 * Calcular fecha de vencimiento según tipo de producto
 * - AEREO: due_date = purchase_date + 10 días
 * - HOTEL: due_date = checkin_date - 30 días
 * - Otros: due_date = departure_date
 */
export function calculateDueDate(
  productType: "AEREO" | "HOTEL" | "PAQUETE" | "CRUCERO" | "OTRO" | null,
  purchaseDate?: string,
  checkinDate?: string,
  departureDate?: string
): string {
  const baseDate = new Date()

  if (productType === "AEREO" && purchaseDate) {
    const date = new Date(purchaseDate)
    date.setDate(date.getDate() + 10)
    return date.toISOString().split("T")[0]
  }

  if (productType === "HOTEL" && checkinDate) {
    const date = new Date(checkinDate)
    date.setDate(date.getDate() - 30)
    return date.toISOString().split("T")[0]
  }

  if (departureDate) {
    return departureDate
  }

  // Default: 30 días desde hoy
  baseDate.setDate(baseDate.getDate() + 30)
  return baseDate.toISOString().split("T")[0]
}

/**
 * Crear pago a operador
 * @param operationId - ID de la operación (opcional para pagos manuales)
 */
export async function createOperatorPayment(
  supabase: SupabaseClient<Database>,
  operatorId: string,
  amount: number,
  currency: "ARS" | "USD",
  dueDate: string,
  operationId?: string | null,
  notes?: string
): Promise<{ id: string }> {
  const { data, error } = await (supabase.from("operator_payments") as any)
    .insert({
      operation_id: operationId || null,
      operator_id: operatorId,
      amount,
      currency,
      due_date: dueDate,
      status: "PENDING",
      paid_amount: 0,
      notes: notes || null,
    })
    .select("id")
    .single()

  if (error) {
    console.error("Error creating operator payment:", error)
    throw new Error(`Error creando pago a operador: ${error.message}`)
  }

  return { id: data.id }
}

/**
 * Marcar pago como pagado
 */
export async function markOperatorPaymentAsPaid(
  supabase: SupabaseClient<Database>,
  paymentId: string,
  ledgerMovementId: string
): Promise<void> {
  const { error } = await (supabase.from("operator_payments") as any)
    .update({
      status: "PAID",
      ledger_movement_id: ledgerMovementId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId)

  if (error) {
    console.error("Error marking operator payment as paid:", error)
    throw new Error(`Error marcando pago como pagado: ${error.message}`)
  }
}

/**
 * Obtener pagos vencidos
 */
export async function getOverdueOperatorPayments(
  supabase: SupabaseClient<Database>,
  operatorId?: string
): Promise<any[]> {
  const today = new Date().toISOString().split("T")[0]

  let query = (supabase.from("operator_payments") as any)
    .select(
      `
      *,
      operations:operation_id (id, destination, file_code),
      operators:operator_id (id, name)
    `
    )
    .eq("status", "PENDING")
    .lt("due_date", today)
    .order("due_date", { ascending: true })

  if (operatorId) {
    query = query.eq("operator_id", operatorId)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching overdue operator payments:", error)
    throw new Error(`Error obteniendo pagos vencidos: ${error.message}`)
  }

  return data || []
}

/**
 * Actualizar estado de pagos vencidos (marcar como OVERDUE)
 */
export async function updateOverduePayments(
  supabase: SupabaseClient<Database>
): Promise<{ updated: number }> {
  const today = new Date().toISOString().split("T")[0]

  const { data, error } = await (supabase.from("operator_payments") as any)
    .update({
      status: "OVERDUE",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "PENDING")
    .lt("due_date", today)
    .select("id")

  if (error) {
    console.error("Error updating overdue payments:", error)
    throw new Error(`Error actualizando pagos vencidos: ${error.message}`)
  }

  return { updated: data?.length || 0 }
}

