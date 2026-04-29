import { MovementsPageClient } from "@/components/cash/movements-page-client"
import { CashFiltersState } from "@/components/cash/cash-filters"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

function getDefaultDateRange() {
  const today = new Date()
  const from = new Date(today.getFullYear(), 0, 1) // 1° de enero del año actual

  return {
    dateFrom: from.toISOString().split("T")[0],
    dateTo: today.toISOString().split("T")[0],
  }
}

export default async function CashMovementsPage() {
  const { user } = await getCurrentUser()
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
    dateType: "MOVIMIENTO",
    agencyId: "ALL",
    currency: "ALL",
  }

  return <MovementsPageClient agencies={agencies} defaultFilters={defaultFilters} userRole={user.role} />
}
