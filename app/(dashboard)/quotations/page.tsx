import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { QuotationsPageClient } from "@/components/quotations/quotations-page-client"
import { canAccessModule } from "@/lib/permissions"

export default async function QuotationsPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  const userRole = user.role as any
  if (!canAccessModule(userRole, "leads")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Cotizaciones</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a cotizaciones</p>
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

  // Get sellers for filters
  let sellersQuery = supabase.from("users").select("id, name").eq("role", "SELLER")
  if (user.role === "SELLER") {
    sellersQuery = sellersQuery.eq("id", user.id)
  }
  const { data: sellers } = await sellersQuery

  // Get operators for filters
  const { data: operators } = await supabase
    .from("operators")
    .select("id, name")
    .order("name", { ascending: true })

  // Get initial quotations
  let query = supabase
    .from("quotations")
    .select(`
      *,
      leads:lead_id(id, contact_name, destination, status),
      agencies:agency_id(id, name),
      sellers:seller_id(id, name, email),
      operators:operator_id(id, name),
      operations:operation_id(id, destination, status),
      quotation_items(*)
    `)

  if (user.role === "SELLER") {
    query = query.eq("seller_id", user.id)
  } else if (agencyIds.length > 0) {
    query = query.in("agency_id", agencyIds)
  }

  const { data: quotations } = await query
    .order("created_at", { ascending: false })
    .limit(100)

  return (
    <QuotationsPageClient
      initialQuotations={quotations || []}
      agencies={(agencies || []) as Array<{ id: string; name: string }>}
      sellers={(sellers || []) as Array<{ id: string; name: string }>}
      operators={(operators || []) as Array<{ id: string; name: string }>}
      defaultAgencyId={agencyIds[0] || undefined}
      defaultSellerId={user.role === "SELLER" ? user.id : undefined}
    />
  )
}

