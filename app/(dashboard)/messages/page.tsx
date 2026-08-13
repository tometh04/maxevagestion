import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { MessagesPageClient } from "@/components/whatsapp/messages-page-client"
import { buildSellerMessageScopeFilter, getSellerOperationIds } from "@/lib/whatsapp/message-access"

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
  const sellerOperationIds =
    user.role === "SELLER" ? await getSellerOperationIds(supabase, user.id) : []
  const canLoadMessages = user.role === "SUPER_ADMIN" || user.role === "SELLER" || agencyIds.length > 0
  const canLoadTemplates = user.role === "SUPER_ADMIN" || agencyIds.length > 0

  // Scope reutilizable (org + rol). SUPER_ADMIN en Vibook es del TENANT, no del
  // platform, así que igual se filtra por org_id (regla de oro multi-tenant).
  const scopeMessages = (q: any) => {
    q = q.eq("org_id", (user as any).org_id)
    if (user.role === "SELLER") {
      q = q.or(buildSellerMessageScopeFilter(user.id, sellerOperationIds))
    } else if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      q = q.in("agency_id", agencyIds)
    }
    return q
  }

  // VIB-61 (audit): antes se traían 2000 mensajes ordenados por scheduled_for
  // ASC (los más VIEJOS) y los KPIs (Pendientes/Enviados/Omitidos) se contaban
  // sobre ese set → con >2000 mensajes acumulados los contadores mentían y los
  // pendientes recientes podían faltar. Ahora:
  //  - Conteos EXACTOS de SENT/SKIPPED en la DB (los que se acumulan).
  //  - Se cargan TODAS las pendientes (accionables) + las enviadas/omitidas
  //    recientes, así ningún pendiente reciente queda afuera.
  const countStatus = async (status: string): Promise<number> => {
    if (!canLoadMessages) return 0
    const { count } = await scopeMessages(
      (supabase.from("whatsapp_messages") as any).select("id", { count: "exact", head: true }),
    ).eq("status", status)
    return count || 0
  }

  const MSG_SELECT = `
    *,
    message_templates:template_id (name, emoji_prefix, category),
    customers:customer_id (first_name, last_name, email),
    operations:operation_id (destination, departure_date, checkin_date, checkout_date, file_code, seller_id)
  `
  const base = () => scopeMessages((supabase.from("whatsapp_messages") as any).select(MSG_SELECT))

  const [pendingRes, sentRes, skippedRes, sentCount, skippedCount] = canLoadMessages
    ? await Promise.all([
        base().eq("status", "PENDING").order("scheduled_for", { ascending: true }).limit(2000),
        base().eq("status", "SENT").order("scheduled_for", { ascending: false }).limit(500),
        base().eq("status", "SKIPPED").order("scheduled_for", { ascending: false }).limit(500),
        countStatus("SENT"),
        countStatus("SKIPPED"),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }, 0, 0]

  const messages = [
    ...((pendingRes as any).data || []),
    ...((sentRes as any).data || []),
    ...((skippedRes as any).data || []),
  ]

  let templates: any[] = []
  if ((user.role === "SUPER_ADMIN" || user.role === "ADMIN") && canLoadTemplates) {
    // 🔴 CROSS-TENANT FIX (2026-05-21): scope por org_id obligatorio.
    let templatesQuery = (supabase.from("message_templates") as any)
      .select("*")
      .eq("is_active", true)
      .eq("org_id", (user as any).org_id)
      .order("category", { ascending: true })

    if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
      templatesQuery = templatesQuery.or(`agency_id.in.(${agencyIds.join(",")}),agency_id.is.null`)
    }

    const { data: loadedTemplates } = await templatesQuery
    templates = loadedTemplates || []
  }

  return (
    <MessagesPageClient
      initialMessages={messages || []}
      templates={templates}
      agencies={agencies}
      userId={user.id}
      userRole={user.role}
      sentCount={sentCount}
      skippedCount={skippedCount}
    />
  )
}

