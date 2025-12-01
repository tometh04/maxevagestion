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

  // Obtener alertas/notificaciones
  let query = (supabase.from("alerts") as any)
    .select(`
      *,
      operations:operation_id (id, destination, departure_date),
      users:user_id (id, name)
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  // Filtrar por agencia si no es super admin
  if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
    query = query.in("agency_id", agencyIds)
  }

  // Vendedores solo ven sus propias alertas
  if (user.role === "SELLER") {
    query = query.eq("user_id", user.id)
  }

  const { data: alerts } = await query

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Notificaciones</h1>
        <p className="text-muted-foreground">
          Centro de alertas y notificaciones del sistema
        </p>
      </div>

      <NotificationsPageClient 
        initialAlerts={alerts || []}
        userId={user.id}
      />
    </div>
  )
}

