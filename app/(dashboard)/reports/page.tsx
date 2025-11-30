import { ReportsPageClient } from "@/components/reports/reports-page-client"
import { ReportsFiltersState } from "@/components/reports/reports-filters"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { canAccessModule, isOwnDataOnly } from "@/lib/permissions"

function getDefaultDateRange() {
  const today = new Date()
  const from = new Date()
  from.setDate(today.getDate() - 30)

  return {
    dateFrom: from.toISOString().split("T")[0],
    dateTo: today.toISOString().split("T")[0],
  }
}

export default async function ReportsPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  const userRole = user.role as any
  if (!canAccessModule(userRole, "reports")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Reportes</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a reportes</p>
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

  let agencies: Array<{ id: string; name: string }> = []

  if (user.role === "SUPER_ADMIN") {
    const { data } = await supabase.from("agencies").select("id, name").order("name")
    agencies = data || []
  } else if (userAgencies && userAgencies.length > 0) {
    const agencyIds = userAgencies.map((ua: any) => ua.agency_id)
    const { data } = await supabase.from("agencies").select("id, name").in("id", agencyIds)
    agencies = data || []
  }

  // Get sellers
  let sellersQuery = supabase
    .from("users")
    .select("id, name")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("is_active", true)

  // Si es vendedor, solo puede ver sus propios reportes
  if (user.role === "SELLER") {
    sellersQuery = sellersQuery.eq("id", user.id)
  }

  const { data: sellers } = await sellersQuery

  const dates = getDefaultDateRange()

  // Si es vendedor, forzar que solo vea sus propios datos
  const ownDataOnly = isOwnDataOnly(userRole, "reports")

  const defaultFilters: ReportsFiltersState = {
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    agencyId: "ALL",
    sellerId: ownDataOnly ? user.id : "ALL",
    reportType: "sales",
  }

  return (
    <ReportsPageClient
      agencies={agencies}
      sellers={(sellers || []).map((s: any) => ({ id: s.id, name: s.name }))}
      defaultFilters={defaultFilters}
    />
  )
}
