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

/** Días de un mes, para poder clampear sin depender de la zona del servidor. */
function daysInMonthUTC(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/**
 * Corre una fecha de vencimiento `steps` períodos (negativo = hacia atrás).
 *
 * ⚠️ Trabaja sobre los números del calendario, NO sobre un `Date` local.
 * La versión anterior hacía `new Date("2026-10-01")` —que es medianoche UTC— y
 * la corría con date-fns, que opera en la zona del proceso. En un servidor en
 * UTC daba bien; en cualquier otra zona devolvía el día anterior. Es la misma
 * clase de bug que VIB-178: una fecha sin hora tratada como un instante.
 *
 * Se conserva el clampeo de fin de mes que traía date-fns: 31/01 + 1 mes es
 * 28/02, no 03/03.
 */
function shiftDueDate(
  dateStr: string,
  frequency: RecurringPaymentFrequency,
  steps: number
): string {
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number)

  const shiftDays = (n: number) => {
    const d = new Date(Date.UTC(year, month - 1, day + n))
    return d.toISOString().slice(0, 10)
  }

  const shiftMonths = (n: number) => {
    const total = (month - 1) + n
    const targetYear = year + Math.floor(total / 12)
    const targetMonth = ((total % 12) + 12) % 12
    const clamped = Math.min(day, daysInMonthUTC(targetYear, targetMonth))
    return new Date(Date.UTC(targetYear, targetMonth, clamped)).toISOString().slice(0, 10)
  }

  switch (frequency) {
    case "WEEKLY":
      return shiftDays(7 * steps)
    case "BIWEEKLY":
      return shiftDays(14 * steps)
    case "MONTHLY":
      return shiftMonths(steps)
    case "QUARTERLY":
      return shiftMonths(3 * steps)
    case "YEARLY":
      return shiftMonths(12 * steps)
  }
}

/**
 * Calcular la próxima fecha de vencimiento según la frecuencia
 */
export function calculateNextDueDate(
  lastDate: string,
  frequency: RecurringPaymentFrequency
): string {
  return shiftDueDate(lastDate, frequency, 1)
}

/**
 * La fecha de vencimiento ANTERIOR (VIB-179).
 *
 * Se usa al borrar el pago de un gasto fijo: si el pago desaparece, la
 * recurrencia tiene que volver a quedar pendiente del período que se borró. Sin
 * esto, borrar el pago de septiembre dejaría `next_due_date` en octubre y el
 * gasto se saltearía un mes entero sin que nadie lo note.
 *
 * ⚠️ No es el inverso exacto de `calculateNextDueDate` en los fines de mes:
 * addMonths(31/01) da 28/02, y subMonths(28/02) da 28/01, no 31/01. Es la misma
 * limitación que tiene el cálculo hacia adelante y se prefiere aceptarla antes
 * que inventar un día que la recurrencia nunca tuvo. Para un gasto fijo, que
 * casi siempre vence a principio de mes, no se manifiesta.
 */
export function calculatePreviousDueDate(
  nextDate: string,
  frequency: RecurringPaymentFrequency
): string {
  return shiftDueDate(nextDate, frequency, -1)
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
    agency_id: string | null
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

