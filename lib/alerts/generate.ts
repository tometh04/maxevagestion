import { createServerClient } from "@/lib/supabase/server"
import {
  generateAllAccountingAlerts,
  generateMissingDocsAlert,
} from "./accounting-alerts"
import { generatePaymentReminders } from "./payment-reminders"

/**
 * Genera alertas de pagos vencidos y próximos a vencer
 * NOTA: Esta función ha sido mejorada y ahora usa generatePaymentReminders()
 * que genera alertas en múltiples momentos (7 días, 3 días, hoy, vencidos)
 * 
 * @deprecated Usar generatePaymentReminders() directamente
 */
export async function generatePaymentAlerts(): Promise<void> {
  // Usar la nueva función mejorada
  await generatePaymentReminders()
}

/**
 * Genera alertas de viajes próximos (48-72h antes)
 */
export async function generateUpcomingTripAlerts(): Promise<void> {
  const supabase = await createServerClient()
  const today = new Date()
  const twoDaysFromNow = new Date(today)
  twoDaysFromNow.setDate(today.getDate() + 2)
  const threeDaysFromNow = new Date(today)
  threeDaysFromNow.setDate(today.getDate() + 3)

  // Get operations with departure_date in 48-72h range
  const { data: operations, error } = await supabase
    .from("operations")
    .select("*")
    .in("status", ["RESERVED", "CONFIRMED"])
    .gte("departure_date", twoDaysFromNow.toISOString().split("T")[0])
    .lte("departure_date", threeDaysFromNow.toISOString().split("T")[0])

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
  const supabase = await createServerClient()
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
 */
export async function generateAllAlerts(): Promise<void> {
  const supabase = await createServerClient()
  
  console.log("🔄 Generating payment reminders (7 days, 3 days, today, overdue)...")
  const reminderResult = await generatePaymentReminders()
  console.log(`   ✅ Created ${reminderResult.created} payment reminders`)
  if (reminderResult.errors.length > 0) {
    console.log(`   ⚠️ ${reminderResult.errors.length} errors`)
  }

  console.log("🔄 Generating upcoming trip alerts...")
  await generateUpcomingTripAlerts()

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

