/**
 * Genera mensajes de WhatsApp basados en alertas de operaciones
 * Se ejecuta cuando se crean alertas (check-in, check-out, cumpleaños, etc.)
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { format } from "date-fns"
import { es } from "date-fns/locale"

/**
 * Mapea tipos de alerta a trigger_types de templates
 */
const ALERT_TO_TRIGGER_MAP: Record<string, string> = {
  UPCOMING_TRIP: "TRIP_1D_BEFORE", // Check-in o check-out (3 días antes de salida o 1 día antes de regreso)
  BIRTHDAY: "BIRTHDAY",
  GENERIC: "BIRTHDAY", // Para alertas genéricas de cumpleaños
  PAYMENT_DUE: "PAYMENT_DUE_3D",
  OPERATOR_DUE: "MANUAL",
  MISSING_DOC: "MANUAL",
  DESTINATION_REQUIREMENT: "MANUAL",
  PASSPORT_EXPIRY: "MANUAL",
}

/**
 * Determina el trigger_type basado en la descripción de la alerta
 */
function getTriggerTypeFromAlert(alert: { type: string; description: string }): string {
  const desc = alert.description.toLowerCase()
  
  // Check-in (3 días antes de salida)
  if (desc.includes("check-in") || desc.includes("salida")) {
    return "TRIP_7D_BEFORE" // O TRIP_1D_BEFORE según el template disponible
  }
  
  // Check-out (día antes de regreso)
  if (desc.includes("check-out") || desc.includes("regreso")) {
    return "TRIP_RETURN"
  }
  
  // Cumpleaños
  if (desc.includes("cumpleaños") || desc.includes("birthday") || alert.type === "BIRTHDAY" || alert.type === "GENERIC") {
    return "BIRTHDAY"
  }
  
  // Por defecto, usar el mapeo estándar
  return ALERT_TO_TRIGGER_MAP[alert.type] || "MANUAL"
}

/**
 * Genera un mensaje de WhatsApp para una alerta
 */
export async function generateMessageFromAlert(
  supabase: SupabaseClient<Database>,
  alert: {
    id: string
    operation_id: string | null
    customer_id: string | null
    type: string
    description: string
    date_due: string
    user_id: string | null
  }
): Promise<boolean> {
  try {
    // Si no hay operación, no podemos generar mensaje
    if (!alert.operation_id) {
      return false
    }

    // Obtener la operación con sus clientes
    const { data: operationData, error: opError } = await supabase
      .from("operations")
      .select(`
        *,
        operation_customers(
          role,
          customers:customer_id (
            id,
            first_name,
            last_name,
            phone
          )
        )
      `)
      .eq("id", alert.operation_id)
      .single()

    if (opError || !operationData) {
      console.error("Error obteniendo operación:", opError)
      return false
    }

    const operation = operationData as any

    // Obtener cliente principal (MAIN) o el primero disponible
    const mainCustomer = operation.operation_customers?.find(
      (oc: any) => oc.role === "MAIN" && oc.customers?.phone
    )?.customers || operation.operation_customers?.find(
      (oc: any) => oc.customers?.phone
    )?.customers

    if (!mainCustomer?.phone) {
      console.log("No hay cliente con teléfono para esta alerta")
      return false
    }

    // Obtener el trigger_type correspondiente (usar función inteligente)
    const triggerType = getTriggerTypeFromAlert(alert)

    // Obtener template activo para este trigger
    const { data: template } = await (supabase.from("message_templates") as any)
      .select("*")
      .eq("trigger_type", triggerType)
      .eq("is_active", true)
      .or(`agency_id.eq.${operation.agency_id},agency_id.is.null`)
      .order("agency_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (!template) {
      console.log(`No hay template activo para trigger: ${triggerType}`)
      return false
    }

    // Preparar variables para el template
    const variables: Record<string, string> = {
      nombre: mainCustomer.first_name || "Cliente",
      destino: operation.destination || "tu viaje",
    }

    // Agregar fechas según el tipo de alerta
    if (operation.departure_date) {
      variables.fecha_salida = format(new Date(operation.departure_date), "dd/MM/yyyy", { locale: es })
    }
    if (operation.return_date) {
      variables.fecha_regreso = format(new Date(operation.return_date), "dd/MM/yyyy", { locale: es })
    }
    if (operation.checkin_date) {
      variables.fecha_checkin = format(new Date(operation.checkin_date), "dd/MM/yyyy", { locale: es })
    }
    if (operation.checkout_date) {
      variables.fecha_checkout = format(new Date(operation.checkout_date), "dd/MM/yyyy", { locale: es })
    }

    // Para cumpleaños, agregar fecha de cumpleaños
    if (alert.type === "BIRTHDAY" || alert.type === "GENERIC") {
      // Intentar obtener fecha de cumpleaños del cliente
      if (mainCustomer.id) {
        const { data: customerData } = await supabase
          .from("customers")
          .select("date_of_birth")
          .eq("id", mainCustomer.id)
          .single()

        const typedCustomerData = customerData as { date_of_birth: string | null } | null
        if (typedCustomerData?.date_of_birth) {
          const birthDate = new Date(typedCustomerData.date_of_birth)
          variables.fecha_cumpleanos = format(birthDate, "dd/MM", { locale: es })
        }
      }
    }

    // Reemplazar variables en el template
    let message = template.template
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, "g"), value || "")
    }

    // Generar link de WhatsApp
    const cleanPhone = mainCustomer.phone.replace(/\D/g, "")
    const whatsappLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`

    // Verificar si ya existe un mensaje para esta alerta
    const { data: existingMessage } = await (supabase.from("whatsapp_messages") as any)
      .select("id")
      .eq("operation_id", alert.operation_id)
      .eq("template_id", template.id)
      .eq("customer_id", mainCustomer.id)
      .maybeSingle()

    if (existingMessage) {
      console.log("Ya existe un mensaje para esta alerta")
      return false
    }

    // Crear el mensaje programado para la fecha de la alerta
    const scheduledFor = new Date(alert.date_due)
    scheduledFor.setHours(9, 0, 0, 0) // Programar para las 9 AM del día de la alerta

    const { error: insertError } = await (supabase.from("whatsapp_messages") as any).insert({
      template_id: template.id,
      customer_id: mainCustomer.id,
      phone: mainCustomer.phone,
      customer_name: `${mainCustomer.first_name} ${mainCustomer.last_name}`.trim(),
      message,
      whatsapp_link: whatsappLink,
      operation_id: alert.operation_id,
      agency_id: operation.agency_id,
      scheduled_for: scheduledFor.toISOString(),
      status: "PENDING",
    })

    if (insertError) {
      console.error("Error creando mensaje WhatsApp:", insertError)
      return false
    }

    console.log(`✅ Mensaje WhatsApp creado para alerta ${alert.id}: ${triggerType}`)
    return true
  } catch (error: any) {
    console.error("Error en generateMessageFromAlert:", error)
    return false
  }
}

/**
 * Genera mensajes para múltiples alertas
 */
export async function generateMessagesFromAlerts(
  supabase: SupabaseClient<Database>,
  alerts: Array<{
    id: string
    operation_id: string | null
    customer_id: string | null
    type: string
    description: string
    date_due: string
    user_id: string | null
  }>
): Promise<number> {
  let generated = 0
  for (const alert of alerts) {
    const success = await generateMessageFromAlert(supabase, alert)
    if (success) {
      generated++
    }
  }
  return generated
}

