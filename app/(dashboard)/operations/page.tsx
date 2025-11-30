import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { OperationsPageClient } from "@/components/operations/operations-page-client"
import { canAccessModule } from "@/lib/permissions"

export default async function OperationsPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  if (!canAccessModule(user.role as any, "operations")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Operaciones</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a operaciones</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()

  // Get user agencies
  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id, agencies(id, name)")
    .eq("user_id", user.id)

  const agencies = (userAgencies || []).map((ua: any) => ({
    id: ua.agency_id,
    name: ua.agencies?.name || "Sin nombre",
  }))

  // Get sellers (all users with SELLER role or ADMIN/SUPER_ADMIN)
  const { data: sellers } = await supabase
    .from("users")
    .select("id, name")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("is_active", true)

  // Get operators
  const { data: operators } = await supabase.from("operators").select("id, name").order("name")

  return (
    <OperationsPageClient
      sellers={(sellers || []).map((s: any) => ({ id: s.id, name: s.name }))}
      agencies={agencies}
      operators={(operators || []).map((o: any) => ({ id: o.id, name: o.name }))}
      userRole={user.role}
      userId={user.id}
      userAgencyIds={agencies.map((a) => a.id)}
      defaultAgencyId={agencies[0]?.id}
      defaultSellerId={user.role === "SELLER" ? user.id : undefined}
    />
  )
}
