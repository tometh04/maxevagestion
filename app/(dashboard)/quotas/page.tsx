import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { QuotasPageClient } from "@/components/quotas/quotas-page-client"
import { canAccessModule } from "@/lib/permissions"

export default async function QuotasPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  const userRole = user.role as any
  if (!canAccessModule(userRole, "operations")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Cupos</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a cupos</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()

  // Get user agencies
  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id")
    .eq("user_id", user.id)

  const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)

  // Get operators
  const { data: operators } = await supabase
    .from("operators")
    .select("id, name")
    .order("name", { ascending: true })

  // Get initial quotas
  let query = (supabase.from("quotas") as any)
    .select(`
      *,
      operators:operator_id(id, name),
      tariffs:tariff_id(id, name, destination)
    `)

  if (user.role !== "SUPER_ADMIN" && agencyIds.length > 0) {
    // For non-super-admin users, filter by operator visibility or agency
    // Since quotas don't have agency_id directly, we filter by operators that belong to user's agencies
    // For simplicity, show all quotas for now (can be refined later)
  }

  const { data: quotas } = await query
    .order("created_at", { ascending: false })
    .limit(100)

  return (
    <QuotasPageClient
      initialQuotas={quotas || []}
      operators={(operators || []) as Array<{ id: string; name: string }>}
    />
  )
}

