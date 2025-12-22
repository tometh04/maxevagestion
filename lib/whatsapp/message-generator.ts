import { SupabaseClient } from "@supabase/supabase-js"
import { addDays, format, isToday, isTomorrow, startOfDay } from "date-fns"
import { es } from "date-fns/locale"

interface MessageTemplate {
  id: string
  name: string
  template: string
  trigger_type: string
  emoji_prefix: string
  agency_id: string | null
}

interface GeneratedMessage {
  template_id: string
  customer_id: string
  phone: string
  customer_name: string
  message: string
  operation_id?: string
  payment_id?: string
  quotation_id?: string
  agency_id: string
  scheduled_for: string
}

/**
 * Reemplaza variables en el template con valores reales
 */
function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value || "")
  }
  return result
}

/**
 * Genera mensajes de cumpleaños para hoy
 */
export async function generateBirthdayMessages(supabase: SupabaseClient): Promise<number> {
  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()

  // Obtener template de cumpleaños
  const { data: template } = await (supabase.from("message_templates") as any)
    .select("*")
    .eq("trigger_type", "BIRTHDAY")
    .eq("is_active", true)
    .is("agency_id", null)
    .single()

  if (!template) return 0

  // Buscar clientes con cumpleaños hoy
  // Nota: customers NO tiene agency_id, se relaciona con agencias a través de operations
  const { data: customers } = await (supabase.from("customers") as any)
    .select("id, first_name, last_name, phone, date_of_birth")
    .not("phone", "is", null)
    .not("date_of_birth", "is", null)

  let generated = 0
  for (const customer of customers || []) {
    const dob = new Date(customer.date_of_birth)
    if (dob.getMonth() + 1 === month && dob.getDate() === day) {
      // Verificar que no existe ya un mensaje para hoy
      const { data: existing } = await (supabase.from("whatsapp_messages") as any)
        .select("id")
        .eq("customer_id", customer.id)
        .eq("template_id", template.id)
        .gte("scheduled_for", startOfDay(today).toISOString())
        .single()

      if (existing) continue

      const message = replaceVariables(template.template, {
        nombre: customer.first_name,
      })

      // Obtener agency_id del cliente a través de sus operaciones (si tiene)
      let customerAgencyId: string | null = null
      const { data: customerOperations } = await (supabase.from("operation_customers") as any)
        .select("operations:operation_id(agency_id)")
        .eq("customer_id", customer.id)
        .limit(1)
        .maybeSingle()

      if (customerOperations?.operations?.agency_id) {
        customerAgencyId = customerOperations.operations.agency_id
      }

      await (supabase.from("whatsapp_messages") as any).insert({
        template_id: template.id,
        customer_id: customer.id,
        phone: customer.phone,
        customer_name: `${customer.first_name} ${customer.last_name}`,
        message,
        agency_id: customerAgencyId,
        scheduled_for: new Date().toISOString(),
        status: "PENDING",
        whatsapp_link: `https://wa.me/${customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`,
      })
      generated++
    }
  }

  return generated
}

/**
 * Genera recordatorios de pago (3 días antes)
 */
export async function generatePaymentReminders(supabase: SupabaseClient): Promise<number> {
  const threeDaysFromNow = addDays(new Date(), 3)
  const targetDate = format(threeDaysFromNow, "yyyy-MM-dd")

  // Obtener template
  const { data: template } = await (supabase.from("message_templates") as any)
    .select("*")
    .eq("trigger_type", "PAYMENT_DUE_3D")
    .eq("is_active", true)
    .is("agency_id", null)
    .single()

  if (!template) return 0

  // Buscar pagos que vencen en 3 días
  const { data: payments } = await (supabase.from("payments") as any)
    .select(`
      *,
      operations:operation_id (
        id, destination, agency_id,
        operation_customers:operation_customers (
          customers:customer_id (id, first_name, last_name, phone)
        )
      )
    `)
    .eq("status", "PENDING")
    .eq("direction", "CUSTOMER_TO_AGENCY")
    .gte("date_due", targetDate)
    .lt("date_due", format(addDays(threeDaysFromNow, 1), "yyyy-MM-dd"))

  let generated = 0
  for (const payment of payments || []) {
    const mainCustomer = payment.operations?.operation_customers?.find(
      (oc: any) => oc.customers?.phone
    )?.customers

    if (!mainCustomer?.phone) continue

    // Verificar que no existe mensaje
    const { data: existing } = await (supabase.from("whatsapp_messages") as any)
      .select("id")
      .eq("payment_id", payment.id)
      .eq("template_id", template.id)
      .single()

    if (existing) continue

    const message = replaceVariables(template.template, {
      nombre: mainCustomer.first_name,
      fecha_vencimiento: format(new Date(payment.date_due), "dd/MM/yyyy"),
      monto: payment.amount.toLocaleString("es-AR"),
      moneda: payment.currency,
      destino: payment.operations?.destination || "tu viaje",
    })

    await (supabase.from("whatsapp_messages") as any).insert({
      template_id: template.id,
      customer_id: mainCustomer.id,
      phone: mainCustomer.phone,
      customer_name: `${mainCustomer.first_name} ${mainCustomer.last_name}`,
      message,
      operation_id: payment.operation_id,
      payment_id: payment.id,
      agency_id: payment.operations?.agency_id,
      scheduled_for: new Date().toISOString(),
      status: "PENDING",
      whatsapp_link: `https://wa.me/${mainCustomer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`,
    })
    generated++
  }

  return generated
}

/**
 * Genera recordatorios de viaje (7 días antes)
 */
export async function generateTripReminders(supabase: SupabaseClient): Promise<number> {
  const sevenDaysFromNow = addDays(new Date(), 7)
  const targetDate = format(sevenDaysFromNow, "yyyy-MM-dd")

  // Obtener template
  const { data: template } = await (supabase.from("message_templates") as any)
    .select("*")
    .eq("trigger_type", "TRIP_7D_BEFORE")
    .eq("is_active", true)
    .is("agency_id", null)
    .single()

  if (!template) return 0

  // Buscar operaciones con salida en 7 días
  const { data: operations } = await (supabase.from("operations") as any)
    .select(`
      *,
      operation_customers:operation_customers (
        role,
        customers:customer_id (id, first_name, last_name, phone)
      )
    `)
    .in("status", ["CONFIRMED", "RESERVED"])
    .gte("departure_date", targetDate)
    .lt("departure_date", format(addDays(sevenDaysFromNow, 1), "yyyy-MM-dd"))

  let generated = 0
  for (const op of operations || []) {
    const mainCustomer = op.operation_customers?.find(
      (oc: any) => oc.role === "MAIN" && oc.customers?.phone
    )?.customers

    if (!mainCustomer?.phone) continue

    // Verificar que no existe mensaje
    const { data: existing } = await (supabase.from("whatsapp_messages") as any)
      .select("id")
      .eq("operation_id", op.id)
      .eq("template_id", template.id)
      .single()

    if (existing) continue

    const message = replaceVariables(template.template, {
      nombre: mainCustomer.first_name,
      destino: op.destination,
      fecha_salida: format(new Date(op.departure_date), "dd/MM/yyyy"),
    })

    await (supabase.from("whatsapp_messages") as any).insert({
      template_id: template.id,
      customer_id: mainCustomer.id,
      phone: mainCustomer.phone,
      customer_name: `${mainCustomer.first_name} ${mainCustomer.last_name}`,
      message,
      operation_id: op.id,
      agency_id: op.agency_id,
      scheduled_for: new Date().toISOString(),
      status: "PENDING",
      whatsapp_link: `https://wa.me/${mainCustomer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`,
    })
    generated++
  }

  return generated
}

/**
 * Ejecuta todos los generadores
 */
export async function runAllMessageGenerators(supabase: SupabaseClient) {
  const results = {
    birthdays: await generateBirthdayMessages(supabase),
    paymentReminders: await generatePaymentReminders(supabase),
    tripReminders: await generateTripReminders(supabase),
  }

  const total = results.birthdays + results.paymentReminders + results.tripReminders

  console.log(`📱 Mensajes WhatsApp generados:
    - Cumpleaños: ${results.birthdays}
    - Recordatorios pago: ${results.paymentReminders}
    - Recordatorios viaje: ${results.tripReminders}
    - Total: ${total}
  `)

  return { results, total }
}

