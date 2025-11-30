import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { TariffsPageClient } from "@/components/tariffs/tariffs-page-client"
import { canAccessModule } from "@/lib/permissions"

export default async function TariffsPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  const userRole = user.role as any
  if (!canAccessModule(userRole, "operations")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Tarifarios</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a tarifarios</p>
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

  const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

  // Get agencies for filters
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
    .in("id", agencyIds.length > 0 ? agencyIds : [])

  // Get operators
  const { data: operators } = await supabase
    .from("operators")
    .select("id, name")
    .order("name", { ascending: true })

  // Get initial tariffs
  let query = (supabase.from("tariffs") as any)
    .select(`
      *,
      operators:operator_id(id, name),
      agencies:agency_id(id, name),
      created_by_user:created_by(id, name)
    `)

  if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
    // Show global tariffs (agency_id IS NULL) or user's agency tariffs
    query = query.or(`agency_id.in.(${agencyIds.join(",")}),agency_id.is.null`)
  }

  const { data: tariffs } = await query
    .order("created_at", { ascending: false })
    .limit(100)

  return (
    <TariffsPageClient
      initialTariffs={tariffs || []}
      agencies={(agencies || []) as Array<{ id: string; name: string }>}
      operators={(operators || []) as Array<{ id: string; name: string }>}
      defaultAgencyId={agencyIds[0] || undefined}
    />
  )
}

