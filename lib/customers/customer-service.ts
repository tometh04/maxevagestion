import { SupabaseClient } from "@supabase/supabase-js"
import { sendEmail } from "@/lib/email/email-service"
import { createWhatsAppMessage } from "@/lib/whatsapp/whatsapp-service"

/**
 * Verifica si existe un cliente duplicado según los campos configurados.
 *
 * 2026-05-22 (VICO/Andrés):
 * - Bug multi-tenant fixeado: antes "verificábamos todos los clientes"
 *   sin filtro por org. Un cliente con email x@y.com en Org A bloqueaba
 *   la creación en Org B Y leakeaba el `duplicateCustomer` cross-tenant.
 *   Ahora orgId es obligatorio para chequear, y se filtra por
 *   .eq("org_id", orgId).
 * - Se devuelve `matchedField` para que el caller pueda mostrar un
 *   mensaje más claro al user ("ya existe cliente con ese teléfono"
 *   en vez de "ya existe un cliente con estos datos").
 */
export async function checkDuplicateCustomer(
  supabase: SupabaseClient,
  customerData: {
    email?: string
    phone?: string
    document_number?: string
  },
  checkFields: string[],
  orgId: string | null | undefined
): Promise<{
  isDuplicate: boolean
  duplicateCustomer?: any
  matchedField?: "email" | "phone" | "document_number"
}> {
  if (checkFields.length === 0 || !orgId) {
    return { isDuplicate: false }
  }

  // Chequeamos campo por campo en queries separadas (no .or(...) ambiguo)
  // para poder devolver qué campo específicamente matcheó.
  const fieldChecks: Array<{
    field: "email" | "phone" | "document_number"
    value: string
  }> = []
  if (checkFields.includes("email") && customerData.email) {
    fieldChecks.push({ field: "email", value: customerData.email })
  }
  if (checkFields.includes("phone") && customerData.phone) {
    fieldChecks.push({ field: "phone", value: customerData.phone })
  }
  if (checkFields.includes("document_number") && customerData.document_number) {
    fieldChecks.push({ field: "document_number", value: customerData.document_number })
  }

  if (fieldChecks.length === 0) {
    return { isDuplicate: false }
  }

  for (const { field, value } of fieldChecks) {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq(field, value)
      .eq("org_id", orgId) // Multi-tenant: defense-in-depth, no confiar en RLS.
      .limit(1)
      .maybeSingle()

    if (error && error.code !== "PGRST116") {
      console.error("Error checking duplicate customer:", error)
      continue
    }

    if (data) {
      return {
        isDuplicate: true,
        duplicateCustomer: data,
        matchedField: field,
      }
    }
  }

  return { isDuplicate: false }
}

/**
 * Envía notificaciones según la configuración de clientes
 */
export async function sendCustomerNotifications(
  supabase: SupabaseClient,
  event: 'new_customer' | 'customer_updated' | 'customer_deleted' | 'customer_operation_created',
  customer: {
    id: string
    first_name: string
    last_name: string
    email: string
    phone?: string
  },
  agencyId: string,
  notifications: Array<{
    event: string
    enabled: boolean
    channels: string[]
  }>
) {
  // Buscar notificación configurada para este evento
  const notification = notifications.find(n => n.event === event && n.enabled)

  if (!notification) {
    return
  }

  const customerName = `${customer.first_name} ${customer.last_name}`

  // Enviar por cada canal configurado
  for (const channel of notification.channels) {
    try {
      switch (channel) {
        case 'email':
          await sendEmail({
            to: customer.email,
            subject: getEmailSubject(event),
            html: getEmailBody(event, customerName),
          })
          break

        case 'whatsapp':
          if (customer.phone) {
            await createWhatsAppMessage({
              supabase,
              triggerType: `customer_${event}`,
              customerId: customer.id,
              customerName,
              customerPhone: customer.phone,
              agencyId,
            })
          }
          break

        case 'system':
          // Crear notificación en el sistema
          await supabase.from("notifications").insert({
            user_id: null, // Notificación general
            type: `customer_${event}`,
            title: getNotificationTitle(event),
            description: getNotificationDescription(event, customerName),
            related_entity_type: 'customer',
            related_entity_id: customer.id,
            agency_id: agencyId,
          })
          break
      }
    } catch (error) {
      console.error(`Error sending ${channel} notification for ${event}:`, error)
    }
  }
}

function getEmailSubject(event: string): string {
  const subjects: Record<string, string> = {
    new_customer: 'Bienvenido a nuestra agencia',
    customer_updated: 'Sus datos han sido actualizados',
    customer_deleted: 'Cuenta eliminada',
    customer_operation_created: 'Nueva operación creada',
  }
  return subjects[event] || 'Notificación de la agencia'
}

function getEmailBody(event: string, customerName: string): string {
  const bodies: Record<string, string> = {
    new_customer: `
      <h2>¡Bienvenido ${customerName}!</h2>
      <p>Gracias por registrarte en nuestra agencia. Estamos aquí para ayudarte con todos tus viajes.</p>
    `,
    customer_updated: `
      <h2>Datos actualizados</h2>
      <p>Hola ${customerName},</p>
      <p>Te informamos que tus datos han sido actualizados en nuestro sistema.</p>
    `,
    customer_deleted: `
      <h2>Cuenta eliminada</h2>
      <p>Hola ${customerName},</p>
      <p>Tu cuenta ha sido eliminada de nuestro sistema.</p>
    `,
    customer_operation_created: `
      <h2>Nueva operación creada</h2>
      <p>Hola ${customerName},</p>
      <p>Se ha creado una nueva operación asociada a tu cuenta.</p>
    `,
  }
  return bodies[event] || '<p>Notificación de la agencia</p>'
}

function getNotificationTitle(event: string): string {
  const titles: Record<string, string> = {
    new_customer: 'Nuevo Cliente',
    customer_updated: 'Cliente Actualizado',
    customer_deleted: 'Cliente Eliminado',
    customer_operation_created: 'Nueva Operación',
  }
  return titles[event] || 'Notificación'
}

function getNotificationDescription(event: string, customerName: string): string {
  const descriptions: Record<string, string> = {
    new_customer: `Se ha registrado un nuevo cliente: ${customerName}`,
    customer_updated: `Los datos de ${customerName} han sido actualizados`,
    customer_deleted: `El cliente ${customerName} ha sido eliminado`,
    customer_operation_created: `Se ha creado una nueva operación para ${customerName}`,
  }
  return descriptions[event] || 'Notificación del sistema'
}

