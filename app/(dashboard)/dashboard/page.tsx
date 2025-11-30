import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client"
import { DashboardFiltersState } from "@/components/dashboard/dashboard-filters"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

function getDefaultDateRange() {
  const today = new Date()
  const from = new Date()
  from.setDate(today.getDate() - 30)

  return {
    dateFrom: from.toISOString().split("T")[0],
    dateTo: today.toISOString().split("T")[0],
  }
}

export default async function DashboardPage() {
  const { user } = await getCurrentUser()
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
  let sellersQuery = supabase.from("users").select("id, name").in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"]).eq("is_active", true)

  const userRole = user.role as string
  if (userRole === "SELLER") {
    sellersQuery = sellersQuery.eq("id", user.id)
  }

  const { data: sellers } = await sellersQuery

  const dates = getDefaultDateRange()

  const defaultFilters: DashboardFiltersState = {
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    agencyId: "ALL",
    sellerId: "ALL",
  }

  return (
    <DashboardPageClient
      agencies={agencies}
      sellers={(sellers || []).map((s: any) => ({ id: s.id, name: s.name }))}
      defaultFilters={defaultFilters}
    />
  )
}

