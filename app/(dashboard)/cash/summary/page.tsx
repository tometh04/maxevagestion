import dynamic from "next/dynamic"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { canAccessModule } from "@/lib/permissions"
import { Skeleton } from "@/components/ui/skeleton"

const CashSummaryClient = dynamic(
  () =>
    import("@/components/cash/cash-summary-client").then((m) => ({
      default: m.CashSummaryClient,
    })),
  {
    loading: () => (
      <div className="space-y-6">
        <div className="flex gap-4 flex-wrap">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[200px] w-full" />
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    ),
  }
)

function getDefaultDateRange() {
  const today = new Date()
  const from = new Date()
  from.setDate(today.getDate() - 7) // Rango semanal por defecto

  return {
    dateFrom: from.toISOString().split("T")[0],
    dateTo: today.toISOString().split("T")[0],
  }
}

export default async function CashSummaryPage() {
  const { user } = await getCurrentUser()
  
  if (!canAccessModule(user.role as any, "cash")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Resumen de Caja</h1>
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

  return <CashSummaryClient agencies={agencies} defaultDateFrom={dates.dateFrom} defaultDateTo={dates.dateTo} />
}

