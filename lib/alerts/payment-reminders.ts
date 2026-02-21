/**
 * PAYMENT REMINDERS SERVICE
 * 
 * Genera alertas automáticas para pagos próximos a vencer en múltiples momentos:
 * - 7 días antes del vencimiento
 * - 3 días antes del vencimiento
 * - El día del vencimiento
 * - Pagos vencidos
 * 
 * Funciona tanto para payments (clientes) como operator_payments (operadores)
 */

import { createServerClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

type ReminderType = "30_DAYS" | "7_DAYS" | "3_DAYS" | "DUE_TODAY" | "OVERDUE"

interface PaymentReminder {
  paymentId: string
  paymentType: "CUSTOMER" | "OPERATOR"
  amount: number
  currency: string
  dueDate: string
  reminderType: ReminderType
  operationId: string | null
  operatorId: string | null
  sellerId: string | null
  description: string
}

/**
 * Calcular el tipo de recordatorio según los días restantes hasta el vencimiento.
 * configuredDays = días antes del vencimiento para alertar (ej: 30 = alerta cuando faltan 30 días)
 */
function calculateReminderType(dueDate: Date, today: Date, configuredDays: number): ReminderType | null {
  const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilDue < 0) {
    return "OVERDUE"
  } else if (daysUntilDue === 0) {
    return "DUE_TODAY"
  } else if (daysUntilDue === 3) {
    return "3_DAYS"
  } else if (daysUntilDue === 7) {
    return "7_DAYS"
  } else if (daysUntilDue === configuredDays) {
    return "30_DAYS" // Usamos el mismo tipo pero con los días configurados
  }

  return null
}

/**
 * Generar recordatorios para pagos de clientes (tabla payments)
 */
async function generateCustomerPaymentReminders(
  supabase: SupabaseClient<Database>,
  today: Date,
  configuredDays: number = 30
): Promise<PaymentReminder[]> {
  const reminders: PaymentReminder[] = []

  // Obtener todos los pagos pendientes de clientes
  const { data: payments, error } = await supabase
    .from("payments")
    .select(
      `
      id,
      operation_id,
      amount,
      currency,
      date_due,
      direction,
      operations:operation_id(
        id,
        seller_id,
        destination,
        file_code
      )
    `
    )
    .eq("status", "PENDING")
    .eq("payer_type", "CUSTOMER")
    .eq("direction", "INCOME")
    .order("date_due", { ascending: true })

  if (error) {
    console.error("Error fetching customer payments:", error)
    return reminders
  }

  for (const payment of (payments || []) as any[]) {
    const dueDate = new Date(payment.date_due)
    const reminderType = calculateReminderType(dueDate, today, configuredDays)

    if (!reminderType) {
      continue
    }

    const operation = payment.operations
    const operationInfo = operation
      ? `${operation.destination}${operation.file_code ? ` (${operation.file_code})` : ""}`
      : "Sin operación"

    reminders.push({
      paymentId: payment.id,
      paymentType: "CUSTOMER",
      amount: parseFloat(payment.amount || "0"),
      currency: payment.currency || "ARS",
      dueDate: payment.date_due,
      reminderType,
      operationId: payment.operation_id,
      operatorId: null,
      sellerId: operation?.seller_id || null,
      description: `Pago pendiente de cliente: ${formatCurrency(
        parseFloat(payment.amount || "0"),
        payment.currency || "ARS"
      )} - ${operationInfo}`,
    })
  }

  return reminders
}

/**
 * Generar recordatorios para pagos a operadores (tabla operator_payments)
 */
async function generateOperatorPaymentReminders(
  supabase: SupabaseClient<Database>,
  today: Date,
  configuredDays: number = 30
): Promise<PaymentReminder[]> {
  const reminders: PaymentReminder[] = []

  // Obtener todos los pagos pendientes a operadores
  const { data: operatorPayments, error } = await supabase
    .from("operator_payments")
    .select(
      `
      id,
      operation_id,
      operator_id,
      amount,
      currency,
      due_date,
      operations:operation_id(
        id,
        seller_id,
        destination,
        file_code
      ),
      operators:operator_id(
        id,
        name
      )
    `
    )
    .eq("status", "PENDING")
    .order("due_date", { ascending: true })

  if (error) {
    console.error("Error fetching operator payments:", error)
    return reminders
  }

  for (const payment of (operatorPayments || []) as any[]) {
    const dueDate = new Date(payment.due_date)
    const reminderType = calculateReminderType(dueDate, today, configuredDays)

    if (!reminderType) {
      continue
    }

    const operation = payment.operations
    const operator = payment.operators
    const operationInfo = operation
      ? `${operation.destination}${operation.file_code ? ` (${operation.file_code})` : ""}`
      : "Pago recurrente"
    const operatorInfo = operator?.name || "Operador desconocido"

    reminders.push({
      paymentId: payment.id,
      paymentType: "OPERATOR",
      amount: parseFloat(payment.amount || "0"),
      currency: payment.currency || "ARS",
      dueDate: payment.due_date,
      reminderType,
      operationId: payment.operation_id,
      operatorId: payment.operator_id,
      sellerId: operation?.seller_id || null,
      description: `Pago pendiente a operador ${operatorInfo}: ${formatCurrency(
        parseFloat(payment.amount || "0"),
        payment.currency || "ARS"
      )} - ${operationInfo}`,
    })
  }

  return reminders
}

/**
 * Formatear moneda
 */
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Crear alerta en la base de datos
 */
async function createReminderAlert(
  supabase: SupabaseClient<Database>,
  reminder: PaymentReminder,
  configuredDays: number = 30
): Promise<boolean> {
  const alertType = reminder.paymentType === "CUSTOMER" ? "PAYMENT_DUE" : "OPERATOR_DUE"

  // Etiquetas de recordatorio para buscar en descripción
  const reminderLabels: Record<ReminderType, string> = {
    "30_DAYS": `Vence en ${configuredDays} días`,
    "7_DAYS": "Vence en 7 días",
    "3_DAYS": "Vence en 3 días",
    DUE_TODAY: "Vence hoy",
    OVERDUE: "Vencido",
  }

  const reminderLabel = reminderLabels[reminder.reminderType]

  // Verificar si ya existe una alerta similar para este pago y tipo de recordatorio
  // Buscamos por operation_id, tipo, fecha de vencimiento y etiqueta en descripción
  const { data: existingAlerts } = await supabase
    .from("alerts")
    .select("id, description")
    .eq("type", alertType)
    .eq("status", "PENDING")
    .eq("date_due", reminder.dueDate)
    .ilike("description", `%${reminderLabel}%`)

  // Si hay alertas existentes, verificar si alguna corresponde a este pago específico
  // Identificamos por el monto y moneda en la descripción
  if (existingAlerts && existingAlerts.length > 0) {
    const amountStr = reminder.amount.toFixed(2)
    const currencyStr = reminder.currency
    
    // Verificar si alguna alerta existente tiene el mismo monto y moneda
    const isDuplicate = existingAlerts.some((alert: any) => {
      const desc = alert.description || ""
      return desc.includes(amountStr) && desc.includes(currencyStr)
    })

    if (isDuplicate) {
      // Ya existe una alerta para este pago con este tipo de recordatorio
      return false
    }
  }

  // Agregar información del recordatorio en la descripción (con emojis)
  const reminderLabelsWithEmojis: Record<ReminderType, string> = {
    "30_DAYS": `📅 Vence en ${configuredDays} días`,
    "7_DAYS": "⏰ Vence en 7 días",
    "3_DAYS": "⚠️ Vence en 3 días",
    DUE_TODAY: "🔴 Vence hoy",
    OVERDUE: "❌ Vencido",
  }

  const fullDescription = `${reminderLabelsWithEmojis[reminder.reminderType]} - ${reminder.description}`

  // Obtener el usuario al que asignar la alerta
  let userId = reminder.sellerId

  // Si no hay seller_id, asignar a un admin
  if (!userId) {
    const { data: adminUser } = await supabase
      .from("users")
      .select("id")
      .in("role", ["ADMIN", "SUPER_ADMIN"])
      .limit(1)
      .maybeSingle()

    userId = (adminUser as any)?.id || null
  }

  if (!userId) {
    console.warn(`No se pudo asignar usuario para alerta: ${reminder.paymentId}`)
    return false
  }

  // Crear la alerta
  const { error } = await supabase.from("alerts").insert({
    operation_id: reminder.operationId,
    user_id: userId,
    type: alertType,
    description: fullDescription,
    date_due: reminder.dueDate,
    status: "PENDING",
  } as any)

  if (error) {
    console.error(`Error creando alerta para pago ${reminder.paymentId}:`, error)
    return false
  }

  return true
}

/**
 * Configuración de alertas de pago, leída de operation_settings
 */
export interface PaymentAlertSettings {
  paymentDueDays: number    // Días antes para alertar pago de cliente (default 30)
  operatorPaymentDays: number // Días antes para alertar pago a operador (default 30)
  paymentDueEnabled: boolean
  operatorPaymentEnabled: boolean
}

/**
 * Generar todos los recordatorios de pagos
 * Esta función debe ejecutarse diariamente
 */
export async function generatePaymentReminders(alertSettings?: PaymentAlertSettings): Promise<{
  created: number
  customerReminders: number
  operatorReminders: number
  errors: string[]
}> {
  const supabase = await createServerClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0) // Normalizar a inicio del día

  const settings: PaymentAlertSettings = alertSettings || {
    paymentDueDays: 30,
    operatorPaymentDays: 30,
    paymentDueEnabled: true,
    operatorPaymentEnabled: true,
  }

  console.log(`🔄 Generando recordatorios de pagos para ${today.toISOString().split("T")[0]}...`)
  console.log(`   Config: cliente=${settings.paymentDueDays}d (${settings.paymentDueEnabled ? 'ON' : 'OFF'}), operador=${settings.operatorPaymentDays}d (${settings.operatorPaymentEnabled ? 'ON' : 'OFF'})`)

  const errors: string[] = []
  let created = 0

  try {
    // Generar recordatorios para pagos de clientes
    let customerReminders: PaymentReminder[] = []
    if (settings.paymentDueEnabled) {
      console.log("📊 Procesando pagos de clientes...")
      customerReminders = await generateCustomerPaymentReminders(supabase, today, settings.paymentDueDays)
      console.log(`   Encontrados ${customerReminders.length} recordatorios de clientes`)

      for (const reminder of customerReminders) {
        try {
          const success = await createReminderAlert(supabase, reminder, settings.paymentDueDays)
          if (success) {
            created++
          }
        } catch (error: any) {
          const errorMsg = `Error creando recordatorio de cliente ${reminder.paymentId}: ${error.message}`
          console.error(errorMsg)
          errors.push(errorMsg)
        }
      }
    } else {
      console.log("📊 Alertas de pago de cliente DESACTIVADAS")
    }

    // Generar recordatorios para pagos a operadores
    let operatorReminders: PaymentReminder[] = []
    if (settings.operatorPaymentEnabled) {
      console.log("📊 Procesando pagos a operadores...")
      operatorReminders = await generateOperatorPaymentReminders(supabase, today, settings.operatorPaymentDays)
      console.log(`   Encontrados ${operatorReminders.length} recordatorios de operadores`)

      for (const reminder of operatorReminders) {
        try {
          const success = await createReminderAlert(supabase, reminder, settings.operatorPaymentDays)
          if (success) {
            created++
          }
        } catch (error: any) {
          const errorMsg = `Error creando recordatorio de operador ${reminder.paymentId}: ${error.message}`
          console.error(errorMsg)
          errors.push(errorMsg)
        }
      }
    } else {
      console.log("📊 Alertas de pago a operador DESACTIVADAS")
    }

    console.log(`✅ Recordatorios generados: ${created} creados`)
    if (errors.length > 0) {
      console.log(`⚠️ Errores: ${errors.length}`)
    }

    return {
      created,
      customerReminders: customerReminders.length,
      operatorReminders: operatorReminders.length,
      errors,
    }
  } catch (error: any) {
    const errorMsg = `Error fatal generando recordatorios: ${error.message}`
    console.error(errorMsg)
    errors.push(errorMsg)
    return {
      created,
      customerReminders: 0,
      operatorReminders: 0,
      errors,
    }
  }
}

