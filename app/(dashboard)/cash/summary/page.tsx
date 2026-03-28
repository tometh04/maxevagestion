import dynamic from "next/dynamic"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { canAccessModule } from "@/lib/permissions"
import { Skeleton } from "@/components/ui/skeleton"
import { CashSummaryTabs } from "@/components/cash/cash-summary-tabs"
import { CashFiltersState } from "@/components/cash/cash-filters"

const CashSummaryClient = dynamic(
  () =>
    import("@/components/cash/cash-summary-client").then((m) => ({
      default: m.CashSummaryClient,
    })),
  {
    loading: () => (
      <div className="space-y-6">
        <Skeleton className="h-[300px] w-full" />
      </div>
    ),
  }
)

const FinancialAccountsPageClient = dynamic(
  () =>
    import("@/components/accounting/financial-accounts-page-client").then((m) => ({
      default: m.FinancialAccountsPageClient,
    })),
  {
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
)

const PaymentsPageClient = dynamic(
  () =>
    import("@/components/cash/payments-page-client").then((m) => ({
      default: m.PaymentsPageClient,
    })),
  {
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
)

const MovementsPageClient = dynamic(
  () =>
    import("@/components/cash/movements-page-client").then((m) => ({
      default: m.MovementsPageClient,
    })),
  {
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
)

const GastosPageClient = dynamic(
  () =>
    import("@/components/expenses/gastos-page-client").then((m) => ({
      default: m.GastosPageClient,
    })),
  {
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
)

function getDefaultDateRange() {
  const today = new Date()
  const from = new Date(today.getFullYear(), today.getMonth(), 1)

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
          <h1 className="text-2xl font-semibold tracking-tight">Caja y Bancos</h1>
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

  // Pagos necesita un rango mucho más amplio para mostrar todos los pagos históricos
  const today = new Date()
  const paymentDefaultFilters: CashFiltersState = {
    dateFrom: new Date(today.getFullYear() - 1, 0, 1).toISOString().split("T")[0], // 1 año atrás, 1 de enero
    dateTo: dates.dateTo,
    agencyId: "ALL",
    currency: "ALL",
  }

  return (
    <CashSummaryTabs
      summaryContent={
        <CashSummaryClient agencies={agencies} defaultDateFrom={dates.dateFrom} defaultDateTo={dates.dateTo} />
      }
      accountsContent={
        <FinancialAccountsPageClient agencies={agencies} />
      }
      paymentsContent={
        <PaymentsPageClient agencies={agencies} defaultFilters={paymentDefaultFilters} />
      }
      movementsContent={
        <MovementsPageClient agencies={agencies} defaultFilters={defaultFilters} />
      }
      expensesContent={
        <GastosPageClient agencies={agencies} />
      }
    />
  )
}
