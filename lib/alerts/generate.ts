import { createAdminClient } from "@/lib/supabase/server"
import {
  generateAllAccountingAlerts,
  generateMissingDocsAlert,
} from "./accounting-alerts"
import { generatePaymentReminders, type PaymentAlertSettings } from "./payment-reminders"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateMessagesFromAlerts } from "@/lib/whatsapp/alert-messages"

/**
 * Configuración leída de operation_settings
 */
export interface AlertGenerationSettings {
  paymentDueDays: number
  paymentDueEnabled: boolean
  operatorPaymentDays: number
  operatorPaymentEnabled: boolean
  upcomingTripDays: number
  upcomingTripEnabled: boolean
}

const DEFAULT_SETTINGS: AlertGenerationSettings = {
  paymentDueDays: 30,
  paymentDueEnabled: true,
  operatorPaymentDays: 30,
  operatorPaymentEnabled: true,
  upcomingTripDays: 7,
  upcomingTripEnabled: true,
}

/**
 * Genera alertas de viajes próximos (según días configurados)
 */
export async function generateUpcomingTripAlerts(tripDays: number = 7): Promise<void> {
  const supabase = createAdminClient()
  const today = new Date()
  // Ventana: desde mañana hasta tripDays días desde hoy
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const limitDate = new Date(today)
  limitDate.setDate(today.getDate() + tripDays)

  // Get operations with departure_date within the configured window
  const { data: operations, error } = await supabase
    .from("operations")
    .select("*")
    .in("status", ["RESERVED", "CONFIRMED"])
    .gte("departure_date", tomorrow.toISOString().split("T")[0])
    .lte("departure_date", limitDate.toISOString().split("T")[0])

  if (error) {
    console.error("Error fetching operations for trip alerts:", error)
    return
  }

  for (const operation of (operations || []) as any[]) {
    // Check if alert already exists
    const { data: existingAlert } = await supabase
      .from("alerts")
      .select("id")
      .eq("operation_id", operation.id)
      .eq("type", "UPCOMING_TRIP")
      .eq("status", "PENDING")
      .single()

    if (existingAlert) {
      continue
    }

    // Create alert
    await supabase.from("alerts").insert({
      org_id: operation.org_id, // P0 2026-05-10: required para RLS tenant_isolation (mig 5)
      operation_id: operation.id,
      user_id: operation.seller_id,
      type: "UPCOMING_TRIP",
      description: `Viaje próximo: ${operation.destination} - Salida: ${new Date(operation.departure_date).toLocaleDateString("es-AR")}`,
      date_due: operation.departure_date,
      status: "PENDING",
    } as any)
  }
}

/**
 * Genera alertas de documentos faltantes
 */
export async function generateMissingDocumentAlerts(): Promise<void> {
  const supabase = createAdminClient()
  const today = new Date()
  const thirtyDaysFromNow = new Date(today)
  thirtyDaysFromNow.setDate(today.getDate() + 30)

  // Get operations with departure_date in next 30 days that need documents
  const { data: operations, error } = await supabase
    .from("operations")
    .select(
      `
      *,
      documents:documents!operation_id(id, type)
    `,
    )
    .in("status", ["RESERVED", "CONFIRMED"])
    .gte("departure_date", today.toISOString().split("T")[0])
    .lte("departure_date", thirtyDaysFromNow.toISOString().split("T")[0])

  if (error) {
    console.error("Error fetching operations for document alerts:", error)
    return
  }

  for (const operation of (operations || []) as any[]) {
    const documents = (operation.documents || []) as any[]
    const hasPassport = documents.some((doc: any) => doc.type === "PASSPORT")

    // For international trips, check if passport is missing
    // This is a simplified check - you might want to check destination region
    if (!hasPassport && operation.destination) {
      // Check if alert already exists
      const { data: existingAlert } = await supabase
        .from("alerts")
        .select("id")
        .eq("operation_id", operation.id)
        .eq("type", "MISSING_DOC")
        .eq("status", "PENDING")
        .single()

      if (existingAlert) {
        continue
      }

      // Create alert
      await supabase.from("alerts").insert({
        org_id: operation.org_id, // P0 2026-05-10: required para RLS tenant_isolation
        operation_id: operation.id,
        user_id: operation.seller_id,
        type: "MISSING_DOC",
        description: `Documento faltante para operación: ${operation.destination} - Se requiere pasaporte`,
        date_due: operation.departure_date,
        status: "PENDING",
      } as any)
    }
  }
}

/**
 * Ejecuta todas las funciones de generación de alertas
 * Recibe settings opcionales de operation_settings
 */
export async function generateAllAlerts(settings?: AlertGenerationSettings): Promise<void> {
  const supabase = createAdminClient()
  const cfg = settings || DEFAULT_SETTINGS

  console.log("📋 Alert settings:", JSON.stringify(cfg))

  // Payment reminders
  const paymentSettings: PaymentAlertSettings = {
    paymentDueDays: cfg.paymentDueDays,
    operatorPaymentDays: cfg.operatorPaymentDays,
    paymentDueEnabled: cfg.paymentDueEnabled,
    operatorPaymentEnabled: cfg.operatorPaymentEnabled,
  }

  console.log("🔄 Generating payment reminders...")
  const reminderResult = await generatePaymentReminders(paymentSettings)
  console.log(`   ✅ Created ${reminderResult.created} payment reminders`)
  if (reminderResult.errors.length > 0) {
    console.log(`   ⚠️ ${reminderResult.errors.length} errors`)
  }

  if (cfg.upcomingTripEnabled) {
    console.log(`🔄 Generating upcoming trip alerts (${cfg.upcomingTripDays} days window)...`)
    await generateUpcomingTripAlerts(cfg.upcomingTripDays)
  } else {
    console.log("🔄 Upcoming trip alerts DISABLED")
  }

  console.log("🔄 Generating missing document alerts...")
  await generateMissingDocumentAlerts()

  console.log("🔄 Generating lead reminders...")
  try {
    const { generateLeadReminders } = await import("./lead-reminders")
    const leadResult = await generateLeadReminders()
    console.log(`   ✅ Created ${leadResult.created} lead reminders`)
    if (leadResult.errors.length > 0) {
      console.log(`   ⚠️ ${leadResult.errors.length} errors`)
    }
  } catch (error) {
    console.error("Error generating lead reminders:", error)
  }

  console.log("🔄 Generating passport expiry alerts...")
  try {
    const { generatePassportExpiryAlerts } = await import("./passport-expiry")
    const passportResult = await generatePassportExpiryAlerts()
    console.log(`   ✅ Created ${passportResult.created} passport expiry alerts (${passportResult.skipped} skipped)`)
    if (passportResult.errors.length > 0) {
      console.log(`   ⚠️ ${passportResult.errors.length} errors`)
    }
  } catch (error) {
    console.error("Error generating passport expiry alerts:", error)
  }

  // Generar alertas contables avanzadas para todas las agencias
  console.log("🔄 Generating accounting alerts...")
  try {
    const { data: agencies } = await supabase.from("agencies").select("id")
    
    if (agencies) {
      // Obtener un usuario admin para asignar las alertas
      const { data: adminUser } = await supabase
        .from("users")
        .select("id")
        .in("role", ["ADMIN", "SUPER_ADMIN"])
        .limit(1)
        .maybeSingle()
      
      const userId = (adminUser as any)?.id || null
      
      if (userId) {
        const { generateAllAccountingAlerts } = await import("./accounting-alerts")
        for (const agency of (agencies as any[])) {
          await generateAllAccountingAlerts(supabase, (agency as any).id, userId)
        }
      }
    }
  } catch (error) {
    console.error("Error generating accounting alerts:", error)
  }

  console.log("✅ All alerts generated")
}

/**
 * Genera alertas a 30 días para pagos a operadores y cobros de clientes
 * Se llama cuando se crea una operación o cuando se crea un pago
 */
export async function generatePaymentAlerts30Days(
  supabase: SupabaseClient<any>,
  operationId: string,
  sellerId: string,
  destination: string
): Promise<void> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const alertsToCreate: any[] = []

  // P0 2026-05-10: derivar org_id desde la operation para inyectarlo en cada INSERT.
  // Sin esto, el cron de alerts crea rows con org_id NULL invisibles a todos los tenants
  // tras tightener la policy (mig 20260510000005).
  const { data: opData } = await (supabase.from("operations") as any)
    .select("org_id")
    .eq("id", operationId)
    .maybeSingle()
  const operationOrgId = (opData as any)?.org_id
  if (!operationOrgId) {
    console.warn(`[generatePaymentAlerts30Days] operation ${operationId} sin org_id — skip`)
    return
  }

  // Obtener todos los pagos de la operación
  const { data: payments } = await (supabase.from("payments") as any)
    .select("id, amount, currency, date_due, direction, payer_type, status")
    .eq("operation_id", operationId)
    .eq("status", "PENDING")

  if (!payments || payments.length === 0) {
    return
  }

  // Verificar si ya existen alertas para estos pagos (evitar duplicados)
  const { data: existingAlerts } = await (supabase.from("alerts") as any)
    .select("id, operation_id, type")
    .eq("operation_id", operationId)
    .in("type", ["PAYMENT_DUE", "OPERATOR_DUE"])
    .eq("status", "PENDING")

  const existingAlertKeys = new Set(
    (existingAlerts || []).map((a: any) => `${operationId}-${a.type}`)
  )

  for (const payment of payments) {
    const dueDate = new Date(payment.date_due + 'T12:00:00')
    const alertDate = new Date(dueDate)
    alertDate.setDate(alertDate.getDate() - 30)

    // Solo crear alerta si la fecha de alerta es en el futuro
    if (alertDate >= today) {
      const alertType = payment.direction === "INCOME" && payment.payer_type === "CUSTOMER"
        ? "PAYMENT_DUE"
        : payment.direction === "EXPENSE" && payment.payer_type === "OPERATOR"
        ? "OPERATOR_DUE"
        : null

      if (alertType) {
        const alertKey = `${operationId}-${alertType}`
        // Evitar duplicados
        if (!existingAlertKeys.has(alertKey)) {
          if (payment.direction === "INCOME" && payment.payer_type === "CUSTOMER") {
            // Alerta de cobro de cliente
            alertsToCreate.push({
              org_id: operationOrgId,
              operation_id: operationId,
              user_id: sellerId,
              type: "PAYMENT_DUE",
              description: `💰 Cobro de cliente: ${payment.currency} ${payment.amount} - ${destination} (Vence: ${payment.date_due})`,
              date_due: alertDate.toISOString().split("T")[0],
              status: "PENDING",
            })
          } else if (payment.direction === "EXPENSE" && payment.payer_type === "OPERATOR") {
            // Alerta de pago a operador
            alertsToCreate.push({
              org_id: operationOrgId,
              operation_id: operationId,
              user_id: sellerId,
              type: "OPERATOR_DUE",
              description: `💸 Pago a operador: ${payment.currency} ${payment.amount} - ${destination} (Vence: ${payment.date_due})`,
              date_due: alertDate.toISOString().split("T")[0],
              status: "PENDING",
            })
          }
        }
      }
    }
  }

  // Insertar alertas
  if (alertsToCreate.length > 0) {
    const { data: createdAlerts, error: insertError } = await (supabase.from("alerts") as any).insert(alertsToCreate).select()
    if (insertError) {
      console.error("Error creando alertas de pagos:", insertError)
    } else {
      console.log(`✅ Creadas ${alertsToCreate.length} alertas de pagos a 30 días para operación ${operationId}`)
      
      // Generar mensajes de WhatsApp para las alertas creadas (con timeout para evitar cuelgues)
      if (createdAlerts && createdAlerts.length > 0) {
        try {
          const messagesPromise = generateMessagesFromAlerts(supabase, createdAlerts)
          const timeoutPromise = new Promise<number>((_, reject) => 
            setTimeout(() => reject(new Error("Timeout generando mensajes WhatsApp")), 5000)
          )
          const messagesGenerated = await Promise.race([messagesPromise, timeoutPromise])
          if (messagesGenerated > 0) {
            console.log(`✅ Generados ${messagesGenerated} mensajes de WhatsApp para alertas de pagos`)
          }
        } catch (error: any) {
          console.error("Error/Timeout generando mensajes de WhatsApp para alertas de pagos:", error?.message || error)
          // No lanzamos error para no romper la creación de alertas
        }
      }
    }
  }
}

