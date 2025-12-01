import { SupabaseClient } from "@supabase/supabase-js"
import { format } from "date-fns"
import { es } from "date-fns/locale"

/**
 * Servicio para crear mensajes WhatsApp automáticos
 */

interface CreateMessageParams {
  supabase: SupabaseClient
  triggerType: string
  customerId: string
  customerName: string
  customerPhone: string
  agencyId: string
  variables?: Record<string, string>
  operationId?: string
  paymentId?: string
  quotationId?: string
}

/**
 * Crea un mensaje WhatsApp basado en un trigger
 */
export async function createWhatsAppMessage({
  supabase,
  triggerType,
  customerId,
  customerName,
  customerPhone,
  agencyId,
  variables = {},
  operationId,
  paymentId,
  quotationId,
}: CreateMessageParams): Promise<boolean> {
  try {
    // Obtener template activo para este trigger
    const { data: template } = await (supabase.from("message_templates") as any)
      .select("*")
      .eq("trigger_type", triggerType)
      .eq("is_active", true)
      .or(`agency_id.eq.${agencyId},agency_id.is.null`)
      .order("agency_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .single()

    if (!template) {
      console.log(`No hay template activo para trigger: ${triggerType}`)
      return false
    }

    // Reemplazar variables en el template
    let message = template.template
    const allVariables = {
      nombre: (customerName || "").split(" ")[0] || "Cliente",
      ...variables,
    }

    for (const [key, value] of Object.entries(allVariables)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, "g"), value || "")
    }

    // Generar link de WhatsApp
    const cleanPhone = (customerPhone || "").replace(/\D/g, "")
    const whatsappLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`

    // Verificar si ya existe un mensaje similar reciente (últimas 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existingMessage } = await (supabase.from("whatsapp_messages") as any)
      .select("id")
      .eq("customer_id", customerId)
      .eq("template_id", template.id)
      .gte("created_at", oneDayAgo)
      .maybeSingle()

    if (existingMessage) {
      console.log(`Ya existe un mensaje reciente para este trigger y cliente`)
      return false
    }

    // Crear el mensaje
    const { error } = await (supabase.from("whatsapp_messages") as any).insert({
      template_id: template.id,
      customer_id: customerId,
      phone: customerPhone,
      customer_name: customerName,
      message,
      whatsapp_link: whatsappLink,
      operation_id: operationId,
      payment_id: paymentId,
      quotation_id: quotationId,
      agency_id: agencyId,
      scheduled_for: new Date().toISOString(),
      status: "PENDING",
    })

    if (error) {
      console.error("Error creando mensaje WhatsApp:", error)
      return false
    }

    console.log(`✅ Mensaje WhatsApp creado: ${triggerType} para ${customerName}`)
    return true
  } catch (error) {
    console.error("Error en createWhatsAppMessage:", error)
    return false
  }
}

/**
 * Crear mensaje de pago recibido
 */
export async function createPaymentReceivedMessage(
  supabase: SupabaseClient,
  payment: {
    id: string
    amount: number
    currency: string
    operation_id: string
  },
  customer: {
    id: string
    first_name: string
    last_name: string
    phone: string
  },
  operation: {
    destination: string
    agency_id: string
  },
  remainingPayments: number
): Promise<boolean> {
  const mensajeCuotas = remainingPayments > 0
    ? `Te quedan ${remainingPayments} cuota${remainingPayments > 1 ? "s" : ""} pendiente${remainingPayments > 1 ? "s" : ""}.`
    : "¡Tu viaje está 100% pago! 🎉"

  return createWhatsAppMessage({
    supabase,
    triggerType: "PAYMENT_RECEIVED",
    customerId: customer.id,
    customerName: `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Cliente",
    customerPhone: customer.phone || "",
    agencyId: operation.agency_id,
    variables: {
      monto: payment.amount.toLocaleString("es-AR"),
      moneda: payment.currency,
      destino: operation.destination,
      mensaje_cuotas: mensajeCuotas,
    },
    operationId: payment.operation_id,
    paymentId: payment.id,
  })
}

/**
 * Crear mensaje de cotización enviada
 */
export async function createQuotationSentMessage(
  supabase: SupabaseClient,
  quotation: {
    id: string
    destination: string
    total_amount: number
    currency: string
    valid_until: string
    agency_id: string
  },
  customer: {
    id: string
    first_name: string
    last_name: string
    phone: string
  }
): Promise<boolean> {
  return createWhatsAppMessage({
    supabase,
    triggerType: "QUOTATION_SENT",
    customerId: customer.id,
    customerName: `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Cliente",
    customerPhone: customer.phone || "",
    agencyId: quotation.agency_id,
    variables: {
      destino: quotation.destination,
      monto: quotation.total_amount.toLocaleString("es-AR"),
      moneda: quotation.currency,
      fecha_validez: format(new Date(quotation.valid_until), "dd/MM/yyyy", { locale: es }),
    },
    quotationId: quotation.id,
  })
}

