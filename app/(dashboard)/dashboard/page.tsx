import dynamic from "next/dynamic"
import { DashboardFiltersState } from "@/components/dashboard/dashboard-filters"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { Skeleton } from "@/components/ui/skeleton"

const DashboardPageClient = dynamic(
  () =>
    import("@/components/dashboard/dashboard-page-client").then((m) => ({
      default: m.DashboardPageClient,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6">
        <div className="flex gap-4 flex-wrap">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24 flex-1 min-w-[140px]" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[280px] w-full" />
          <Skeleton className="h-[280px] w-full" />
        </div>
        <Skeleton className="h-[320px] w-full" />
      </div>
    ),
  }
)

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

