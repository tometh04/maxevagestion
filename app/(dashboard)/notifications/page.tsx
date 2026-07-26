import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { NotificationsPageClient } from "@/components/notifications/notifications-page-client"

export default async function NotificationsPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  // Obtener agencias del usuario
  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id")
    .eq("user_id", user.id)

  const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

  // Scope reutilizable (org + agencia + seller). Se aplica igual a los conteos y
  // a la lista, así los KPIs y lo mostrado hablan del mismo universo.
  // `.eq("org_id")` defensivo (no confiar solo en RLS); condicional para no
  // romper usuarios legacy sin org_id.
  const scoped = (q: any) => {
    let x = q
    if (user.org_id) x = x.eq("org_id", user.org_id)
    if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) x = x.in("agency_id", agencyIds)
    if (user.role === "SELLER") x = x.eq("user_id", user.id)
    return x
  }

  // Conteos EXACTOS server-side (VIB-61 audit): antes los KPIs (Sin leer /
  // Críticas / Advertencias / Total) se calculaban en el cliente sobre las 100
  // alertas más recientes → una alerta crítica más vieja que esas 100 quedaba
  // sin contar e invisible. Ahora se cuentan en la DB.
  const countOf = async (extra: (q: any) => any) => {
    const { count } = await extra(
      scoped((supabase.from("alerts") as any).select("id", { count: "exact", head: true })),
    )
    return count || 0
  }
  const [total, unread, criticalUnread, warningUnread] = await Promise.all([
    countOf((q) => q),
    countOf((q) => q.eq("is_resolved", false)),
    countOf((q) => q.eq("is_resolved", false).eq("severity", "CRITICAL")),
    countOf((q) => q.eq("is_resolved", false).eq("severity", "WARNING")),
  ])

  // Lista: todas las NO leídas (son las accionables) + las leídas recientes. Así
  // ninguna alerta sin leer/crítica queda escondida por un límite fijo. Cap alto
  // por seguridad; los KPIs de arriba son exactos aunque la lista se acote.
  const SELECT = `*, operations:operation_id (id, destination, departure_date), users:user_id (id, name)`
  const { data: unresolved } = await scoped((supabase.from("alerts") as any).select(SELECT))
    .eq("is_resolved", false)
    .order("created_at", { ascending: false })
    .limit(1000)
  const { data: resolvedRecent } = await scoped((supabase.from("alerts") as any).select(SELECT))
    .eq("is_resolved", true)
    .order("created_at", { ascending: false })
    .limit(100)
  const alerts = [...(unresolved || []), ...(resolvedRecent || [])]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notificaciones</h1>
        <p className="text-muted-foreground">
          Centro de alertas y notificaciones del sistema
        </p>
      </div>

      <NotificationsPageClient
        initialAlerts={alerts}
        userId={user.id}
        counts={{ total, unread, criticalUnread, warningUnread }}
      />
    </div>
  )
}

