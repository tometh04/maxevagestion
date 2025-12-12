import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { MessagesPageClient } from "@/components/whatsapp/messages-page-client"

export default async function MessagesPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // Obtener agencias del usuario
  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id, agencies(id, name)")
    .eq("user_id", user.id)

  const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)
  const agencies = (userAgencies || []).map((ua: any) => ua.agencies).filter(Boolean)

  // Obtener mensajes pendientes (hasta 2000 para cubrir todos los mensajes)
  let messagesQuery = (supabase.from("whatsapp_messages") as any)
    .select(`
      *,
      message_templates:template_id (name, emoji_prefix, category),
      customers:customer_id (first_name, last_name, email),
      operations:operation_id (destination, departure_date, checkin_date, checkout_date)
    `)
    .order("scheduled_for", { ascending: true })
    .limit(2000)

  if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
    messagesQuery = messagesQuery.in("agency_id", agencyIds)
  }

  const { data: messages } = await messagesQuery

  // Obtener templates
  let templatesQuery = (supabase.from("message_templates") as any)
    .select("*")
    .eq("is_active", true)
    .order("category", { ascending: true })

  if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
    templatesQuery = templatesQuery.or(`agency_id.in.(${agencyIds.join(",")}),agency_id.is.null`)
  }

  const { data: templates } = await templatesQuery

  return (
    <MessagesPageClient
      initialMessages={messages || []}
      templates={templates || []}
      agencies={agencies}
      userId={user.id}
      userRole={user.role}
    />
  )
}

