import { CashPageClient } from "@/components/cash/cash-page-client"
import { CashFiltersState } from "@/components/cash/cash-filters"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { canAccessModule } from "@/lib/permissions"

function getDefaultDateRange() {
  const today = new Date()
  const from = new Date()
  from.setDate(today.getDate() - 30)

  return {
    dateFrom: from.toISOString().split("T")[0],
    dateTo: today.toISOString().split("T")[0],
  }
}

export default async function CashPage() {
  const { user } = await getCurrentUser()
  
  // Verificar permiso de acceso
  if (!canAccessModule(user.role as any, "cash")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Caja</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a caja</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()

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

  const dates = getDefaultDateRange()

  const defaultFilters: CashFiltersState = {
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    agencyId: "ALL",
    currency: "ALL",
  }

  return <CashPageClient agencies={agencies} defaultFilters={defaultFilters} />
}
