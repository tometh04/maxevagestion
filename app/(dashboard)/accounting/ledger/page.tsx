import dynamic from "next/dynamic"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"
import { Skeleton } from "@/components/ui/skeleton"
import { ContabilidadTabs } from "@/components/accounting/contabilidad-tabs"

const LedgerPageClient = dynamic(
  () =>
    import("@/components/accounting/ledger-page-client").then((m) => ({
      default: m.LedgerPageClient,
    })),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
  }
)

const DebtsSalesPageClient = dynamic(
  () =>
    import("@/components/accounting/debts-sales-page-client").then((m) => ({
      default: m.DebtsSalesPageClient,
    })),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
  }
)

const OperatorPaymentsPageClient = dynamic(
  () =>
    import("@/components/accounting/operator-payments-page-client").then((m) => ({
      default: m.OperatorPaymentsPageClient,
    })),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
  }
)

const PartnerAccountsClient = dynamic(
  () =>
    import("@/components/accounting/partner-accounts-client").then((m) => ({
      default: m.PartnerAccountsClient,
    })),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
  }
)

const MonthlyPositionPageClient = dynamic(
  () =>
    import("@/components/accounting/monthly-position-page-client").then((m) => ({
      default: m.MonthlyPositionPageClient,
    })),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
  }
)

const FacturasComprasPageClient = dynamic(
  () =>
    import("@/components/accounting/facturas-compras-page-client").then((m) => ({
      default: m.FacturasComprasPageClient,
    })),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
  }
)

const JournalEntriesPageClient = dynamic(
  () =>
    import("@/components/accounting/journal-entries-page-client").then((m) => ({
      default: m.JournalEntriesPageClient,
    })),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
  }
)

const ChartOfAccountsTree = dynamic(
  () =>
    import("@/components/accounting/chart-of-accounts-tree").then((m) => ({
      default: m.ChartOfAccountsTree,
    })),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
  }
)

export default async function ContabilidadPage() {
  const { user } = await getCurrentUser()
  const userRole = user.role as any

  if (!canAccessModule(userRole, "accounting")) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contabilidad</h1>
          <p className="text-muted-foreground">No tiene permiso para acceder a contabilidad</p>
        </div>
      </div>
    )
  }

  const supabase = await createServerClient()

  const agencies = await getScopedAgenciesForUser(supabase, user)

  // Get sellers for DebtsSales
  let sellersQuery = supabase
    .from("users")
    .select("id, name")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("is_active", true)

  if (user.role === "SELLER") {
    sellersQuery = sellersQuery.eq("id", user.id)
  }
  const { data: sellers } = await sellersQuery

  // Get operators for OperatorPayments
  const { data: operators } = await supabase.from("operators").select("id, name").order("name")

  const showPartnerAccounts = ["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)

  return (
    <ContabilidadTabs
      journalEntriesContent={
        <JournalEntriesPageClient />
      }
      chartOfAccountsContent={
        <ChartOfAccountsTree />
      }
      monthlyPositionContent={
        <MonthlyPositionPageClient agencies={agencies} userRole={user.role || "SELLER"} />
      }
      ledgerContent={
        <LedgerPageClient agencies={agencies} />
      }
      debtsSalesContent={
        <DebtsSalesPageClient sellers={(sellers || []).map((s: any) => ({ id: s.id, name: s.name }))} />
      }
      operatorPaymentsContent={
        <OperatorPaymentsPageClient
          agencies={agencies}
          operators={(operators || []).map((o: any) => ({ id: o.id, name: o.name }))}
        />
      }
      partnerAccountsContent={
        showPartnerAccounts
          ? <PartnerAccountsClient userRole={user.role} agencies={agencies} />
          : <div />
      }
      facturasComprasContent={
        <FacturasComprasPageClient agencies={agencies} />
      }
      showPartnerAccounts={showPartnerAccounts}
    />
  )
}
