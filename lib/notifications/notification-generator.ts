import { SupabaseClient } from "@supabase/supabase-js"
import { addDays, isBefore, isWithinInterval, startOfDay, endOfDay } from "date-fns"

interface NotificationData {
  user_id: string
  agency_id: string
  type: string
  title: string
  message: string
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  entity_type?: string
  entity_id?: string
  action_url?: string
}

/**
 * Genera notificaciones para pagos próximos a vencer (3 días antes)
 */
export async function generatePaymentDueNotifications(supabase: SupabaseClient) {
  const threeDaysFromNow = addDays(new Date(), 3)
  const today = startOfDay(new Date())

  // Buscar pagos pendientes que vencen en los próximos 3 días
  const { data: payments } = await (supabase.from("payments") as any)
    .select(`
      *,
      operations:operation_id (
        id,
        destination,
        seller_id,
        agency_id
      )
    `)
    .eq("status", "PENDING")
    .gte("date_due", today.toISOString())
    .lte("date_due", threeDaysFromNow.toISOString())

  if (!payments || payments.length === 0) return { generated: 0 }

  let generated = 0
  for (const payment of payments) {
    const operation = payment.operations as any
    if (!operation?.seller_id) continue

    // Verificar si ya existe una notificación para este pago
    const { data: existing } = await (supabase.from("alerts") as any)
      .select("id")
      .eq("operation_id", operation.id)
      .eq("alert_type", "PAYMENT_DUE")
      .eq("is_resolved", false)
      .single()

    if (existing) continue

    // Crear alerta
    await (supabase.from("alerts") as any).insert({
      agency_id: operation.agency_id,
      user_id: operation.seller_id,
      operation_id: operation.id,
      alert_type: "PAYMENT_DUE",
      severity: "WARNING",
      title: `Pago próximo a vencer`,
      message: `Pago de ${payment.currency} ${payment.amount} para ${operation.destination} vence el ${new Date(payment.date_due).toLocaleDateString("es-AR")}`,
      date_due: payment.date_due,
      is_resolved: false,
    })
    generated++
  }

  return { generated }
}

/**
 * Genera notificaciones para pagos vencidos
 */
export async function generateOverduePaymentNotifications(supabase: SupabaseClient) {
  const today = startOfDay(new Date())

  // Buscar pagos pendientes que ya vencieron
  const { data: payments } = await (supabase.from("payments") as any)
    .select(`
      *,
      operations:operation_id (
        id,
        destination,
        seller_id,
        agency_id
      )
    `)
    .eq("status", "PENDING")
    .lt("date_due", today.toISOString())

  if (!payments || payments.length === 0) return { generated: 0 }

  let generated = 0
  for (const payment of payments) {
    const operation = payment.operations as any
    if (!operation?.seller_id) continue

    // Verificar si ya existe una notificación para este pago vencido
    const { data: existing } = await (supabase.from("alerts") as any)
      .select("id")
      .eq("operation_id", operation.id)
      .eq("alert_type", "PAYMENT_OVERDUE")
      .eq("is_resolved", false)
      .single()

    if (existing) continue

    // Crear alerta
    await (supabase.from("alerts") as any).insert({
      agency_id: operation.agency_id,
      user_id: operation.seller_id,
      operation_id: operation.id,
      alert_type: "PAYMENT_OVERDUE",
      severity: "CRITICAL",
      title: `Pago vencido`,
      message: `Pago de ${payment.currency} ${payment.amount} para ${operation.destination} venció el ${new Date(payment.date_due).toLocaleDateString("es-AR")}`,
      date_due: payment.date_due,
      is_resolved: false,
    })
    generated++
  }

  return { generated }
}

/**
 * Genera notificaciones para viajes próximos (7 días antes)
 */
export async function generateUpcomingTripNotifications(supabase: SupabaseClient) {
  const sevenDaysFromNow = addDays(new Date(), 7)
  const today = startOfDay(new Date())

  // Buscar operaciones confirmadas con salida en los próximos 7 días
  const { data: operations } = await (supabase.from("operations") as any)
    .select("*")
    .in("status", ["CONFIRMED", "RESERVED"])
    .gte("departure_date", today.toISOString())
    .lte("departure_date", sevenDaysFromNow.toISOString())

  if (!operations || operations.length === 0) return { generated: 0 }

  let generated = 0
  for (const operation of operations) {
    // Verificar si ya existe una notificación
    const { data: existing } = await (supabase.from("alerts") as any)
      .select("id")
      .eq("operation_id", operation.id)
      .eq("alert_type", "UPCOMING_TRIP")
      .eq("is_resolved", false)
      .single()

    if (existing) continue

    // Crear alerta
    await (supabase.from("alerts") as any).insert({
      agency_id: operation.agency_id,
      user_id: operation.seller_id,
      operation_id: operation.id,
      alert_type: "UPCOMING_TRIP",
      severity: "INFO",
      title: `Viaje próximo`,
      message: `Viaje a ${operation.destination} sale el ${new Date(operation.departure_date).toLocaleDateString("es-AR")}`,
      date_due: operation.departure_date,
      is_resolved: false,
    })
    generated++
  }

  return { generated }
}

/**
 * Genera notificaciones para documentos faltantes
 */
export async function generateMissingDocumentsNotifications(supabase: SupabaseClient) {
  const sevenDaysFromNow = addDays(new Date(), 7)
  const today = startOfDay(new Date())

  // Buscar operaciones confirmadas sin documentos, con salida próxima
  const { data: operations } = await (supabase.from("operations") as any)
    .select(`
      *,
      documents:documents(id)
    `)
    .in("status", ["CONFIRMED", "RESERVED"])
    .gte("departure_date", today.toISOString())
    .lte("departure_date", sevenDaysFromNow.toISOString())

  if (!operations || operations.length === 0) return { generated: 0 }

  let generated = 0
  for (const operation of operations as any[]) {
    const hasDocuments = operation.documents && operation.documents.length > 0
    if (hasDocuments) continue

    // Verificar si ya existe una notificación
    const { data: existing } = await (supabase.from("alerts") as any)
      .select("id")
      .eq("operation_id", operation.id)
      .eq("alert_type", "MISSING_DOCUMENTS")
      .eq("is_resolved", false)
      .single()

    if (existing) continue

    // Crear alerta
    await (supabase.from("alerts") as any).insert({
      agency_id: operation.agency_id,
      user_id: operation.seller_id,
      operation_id: operation.id,
      alert_type: "MISSING_DOCUMENTS",
      severity: "WARNING",
      title: `Documentos faltantes`,
      message: `La operación a ${operation.destination} no tiene documentos adjuntos`,
      date_due: operation.departure_date,
      is_resolved: false,
    })
    generated++
  }

  return { generated }
}

/**
 * Ejecuta todos los generadores de notificaciones
 */
export async function runAllNotificationGenerators(supabase: SupabaseClient) {
  const results = {
    paymentDue: await generatePaymentDueNotifications(supabase),
    paymentOverdue: await generateOverduePaymentNotifications(supabase),
    upcomingTrip: await generateUpcomingTripNotifications(supabase),
    missingDocs: await generateMissingDocumentsNotifications(supabase),
  }

  const totalGenerated = 
    results.paymentDue.generated +
    results.paymentOverdue.generated +
    results.upcomingTrip.generated +
    results.missingDocs.generated

  console.log(`📢 Notificaciones generadas:
    - Pagos por vencer: ${results.paymentDue.generated}
    - Pagos vencidos: ${results.paymentOverdue.generated}
    - Viajes próximos: ${results.upcomingTrip.generated}
    - Documentos faltantes: ${results.missingDocs.generated}
    - Total: ${totalGenerated}
  `)

  return { results, totalGenerated }
}

