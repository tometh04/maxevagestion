/**
 * RECURRING PAYMENTS SERVICE
 * 
 * Este servicio maneja la creación y gestión de pagos recurrentes a proveedores.
 * Los pagos recurrentes se generan automáticamente según su frecuencia.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export type RecurringPaymentFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY"

export interface RecurringPayment {
  id: string
  operator_id: string
  amount: number
  currency: "ARS" | "USD"
  frequency: RecurringPaymentFrequency
  start_date: string
  end_date: string | null
  next_due_date: string
  last_generated_date: string | null
  is_active: boolean
  description: string
  notes: string | null
  invoice_number: string | null
  reference: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

/**
 * Calcular la próxima fecha de vencimiento según la frecuencia
 */
export function calculateNextDueDate(
  lastDate: string,
  frequency: RecurringPaymentFrequency
): string {
  const date = new Date(lastDate)
  const nextDate = new Date(date)

  switch (frequency) {
    case "WEEKLY":
      nextDate.setDate(date.getDate() + 7)
      break
    case "BIWEEKLY":
      nextDate.setDate(date.getDate() + 14)
      break
    case "MONTHLY":
      nextDate.setMonth(date.getMonth() + 1)
      break
    case "QUARTERLY":
      nextDate.setMonth(date.getMonth() + 3)
      break
    case "YEARLY":
      nextDate.setFullYear(date.getFullYear() + 1)
      break
  }

  return nextDate.toISOString().split("T")[0]
}

/**
 * Verificar si un pago recurrente debe generar un pago hoy
 */
export function shouldGeneratePayment(
  recurringPayment: RecurringPayment,
  today: Date = new Date()
): boolean {
  // Si no está activo, no generar
  if (!recurringPayment.is_active) {
    return false
  }

  const todayStr = today.toISOString().split("T")[0]
  const nextDueDate = recurringPayment.next_due_date

  // Si la próxima fecha de vencimiento es hoy o pasada, generar
  if (nextDueDate <= todayStr) {
    // Verificar que no haya fecha de fin o que no haya pasado
    if (recurringPayment.end_date && recurringPayment.end_date < todayStr) {
      return false
    }

    // Verificar que la fecha de inicio haya pasado
    if (recurringPayment.start_date > todayStr) {
      return false
    }

    return true
  }

  return false
}

/**
 * Generar un pago desde un pago recurrente
 * Crea un registro en operator_payments y actualiza el recurring_payment
 */
export async function generatePaymentFromRecurring(
  supabase: SupabaseClient<Database>,
  recurringPaymentId: string,
  userId: string
): Promise<{ operatorPaymentId: string; nextDueDate: string }> {
  // Obtener el pago recurrente
  const { data: recurring, error: recurringError } = await (supabase
    .from("recurring_payments") as any)
    .select("*")
    .eq("id", recurringPaymentId)
    .single()

  if (recurringError || !recurring) {
    throw new Error(`Pago recurrente no encontrado: ${recurringError?.message || "Unknown error"}`)
  }

  const recurringPayment = recurring as RecurringPayment

  // Verificar que debe generar el pago
  if (!shouldGeneratePayment(recurringPayment)) {
    throw new Error("Este pago recurrente no debe generar un pago en este momento")
  }

  // Crear el pago en operator_payments
  // NOTA: Los pagos recurrentes NO están vinculados a una operación específica
  // Por lo tanto, operation_id será NULL
  const { data: operatorPayment, error: paymentError } = await (supabase
    .from("operator_payments") as any)
    .insert({
      operator_id: recurringPayment.operator_id,
      operation_id: null, // Pagos recurrentes no están vinculados a operaciones
      amount: recurringPayment.amount,
      currency: recurringPayment.currency,
      due_date: recurringPayment.next_due_date,
      status: "PENDING",
      notes: `Pago recurrente: ${recurringPayment.description} (${recurringPayment.frequency})`,
    })
    .select("id")
    .single()

  if (paymentError || !operatorPayment) {
    throw new Error(`Error creando pago: ${paymentError?.message || "Unknown error"}`)
  }

  // Calcular próxima fecha de vencimiento
  const nextDueDate = calculateNextDueDate(recurringPayment.next_due_date, recurringPayment.frequency)

  // Actualizar el pago recurrente
  const { error: updateError } = await (supabase.from("recurring_payments") as any)
    .update({
      next_due_date: nextDueDate,
      last_generated_date: recurringPayment.next_due_date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recurringPaymentId)

  if (updateError) {
    console.error("Error actualizando pago recurrente:", updateError)
    // No lanzamos error porque el pago ya se creó
  }

  return {
    operatorPaymentId: operatorPayment.id,
    nextDueDate,
  }
}

/**
 * Generar todos los pagos recurrentes que deben generarse hoy
 * Esta función debe ejecutarse diariamente (cron job)
 */
export async function generateAllRecurringPayments(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ generated: number; errors: string[] }> {
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]

  // Obtener todos los pagos recurrentes activos que deben generar pagos hoy
  const { data: recurringPayments, error } = await (supabase
    .from("recurring_payments") as any)
    .select("*")
    .eq("is_active", true)
    .lte("next_due_date", todayStr)
    .or(`end_date.is.null,end_date.gte.${todayStr}`)
    .gte("start_date", "1900-01-01") // Solo para evitar problemas con fechas muy antiguas

  if (error) {
    throw new Error(`Error obteniendo pagos recurrentes: ${error.message}`)
  }

  const payments = (recurringPayments || []) as RecurringPayment[]
  let generated = 0
  const errors: string[] = []

  for (const recurringPayment of payments) {
    try {
      // Verificar nuevamente que debe generar (por si acaso)
      if (shouldGeneratePayment(recurringPayment, today)) {
        await generatePaymentFromRecurring(supabase, recurringPayment.id, userId)
        generated++
        console.log(`✅ Generado pago recurrente: ${recurringPayment.description} (${recurringPayment.id})`)
      }
    } catch (error: any) {
      const errorMessage = `Error generando pago recurrente ${recurringPayment.id}: ${error.message}`
      console.error(errorMessage)
      errors.push(errorMessage)
    }
  }

  return { generated, errors }
}

/**
 * Obtener todos los pagos recurrentes
 */
export async function getRecurringPayments(
  supabase: SupabaseClient<Database>,
  filters?: {
    operatorId?: string
    isActive?: boolean
  }
): Promise<RecurringPayment[]> {
  let query = (supabase.from("recurring_payments") as any).select(
    `
    *,
    operators:operator_id(id, name, contact_email)
    `
  )

  if (filters?.operatorId) {
    query = query.eq("operator_id", filters.operatorId)
  }

  if (filters?.isActive !== undefined) {
    query = query.eq("is_active", filters.isActive)
  }

  const { data, error } = await query.order("next_due_date", { ascending: true })

  if (error) {
    throw new Error(`Error obteniendo pagos recurrentes: ${error.message}`)
  }

  return (data || []) as RecurringPayment[]
}

/**
 * Crear un nuevo pago recurrente
 */
export async function createRecurringPayment(
  supabase: SupabaseClient<Database>,
  data: {
    operator_id: string
    amount: number
    currency: "ARS" | "USD"
    frequency: RecurringPaymentFrequency
    start_date: string
    end_date?: string | null
    description: string
    notes?: string | null
    invoice_number?: string | null
    reference?: string | null
    created_by: string
  }
): Promise<{ id: string }> {
  // Calcular next_due_date basado en start_date
  const nextDueDate = data.start_date

  const { data: recurring, error } = await (supabase.from("recurring_payments") as any)
    .insert({
      ...data,
      next_due_date: nextDueDate,
      is_active: true,
      end_date: data.end_date || null,
    })
    .select("id")
    .single()

  if (error || !recurring) {
    throw new Error(`Error creando pago recurrente: ${error?.message || "Unknown error"}`)
  }

  return { id: recurring.id }
}

/**
 * Actualizar un pago recurrente
 */
export async function updateRecurringPayment(
  supabase: SupabaseClient<Database>,
  id: string,
  updates: Partial<{
    amount: number
    currency: "ARS" | "USD"
    frequency: RecurringPaymentFrequency
    start_date: string
    end_date: string | null
    next_due_date: string
    is_active: boolean
    description: string
    notes: string | null
    invoice_number: string | null
    reference: string | null
  }>
): Promise<void> {
  const { error } = await (supabase.from("recurring_payments") as any)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) {
    throw new Error(`Error actualizando pago recurrente: ${error.message}`)
  }
}

/**
 * Eliminar (desactivar) un pago recurrente
 */
export async function deleteRecurringPayment(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<void> {
  // En lugar de eliminar, desactivamos
  const { error } = await (supabase.from("recurring_payments") as any)
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (error) {
    throw new Error(`Error eliminando pago recurrente: ${error.message}`)
  }
}

