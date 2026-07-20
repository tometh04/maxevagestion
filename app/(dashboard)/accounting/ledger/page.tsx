import dynamic from "next/dynamic"
import { headers } from "next/headers"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { createServerClient } from "@/lib/supabase/server"
import { getScopedAgenciesForUser } from "@/lib/permissions-api"
import { Skeleton } from "@/components/ui/skeleton"
import { ContabilidadTabs } from "@/components/accounting/contabilidad-tabs"
import { makeTimer } from "@/lib/perf-log"

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

export default async function ContabilidadPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string; accountId?: string; currency?: string }>
}) {
  const sp = (await searchParams) || {}
  const __perfReqId = (await headers()).get("x-perf-req-id") || undefined
  const t = makeTimer("page(accounting/ledger)", __perfReqId)

  const { user } = await getCurrentUser()
  t.mark("getCurrentUser")
  const userRole = user.role as any

  if (!canAccessModule(userRole, "accounting")) {
    t.end("forbidden")
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
  t.mark("createServerClient")

  // Get sellers for DebtsSales.
  // 🔴 CROSS-TENANT FIX (2026-05-21): filtro explícito por org_id —
  // ver CLAUDE.md regla de oro multi-tenant.
  let sellersQuery = supabase
    .from("users")
    .select("id, name")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN", "POST_VENTA"])
    .eq("is_active", true)
    .eq("org_id", (user as any).org_id)

  if (user.role === "SELLER") {
    sellersQuery = sellersQuery.eq("id", user.id)
  }

  // PERF: paralelizamos las 3 fuentes (agencies scope, sellers, operators).
  // getScopedAgenciesForUser hace queries propias dentro pero no dependen
  // de sellers/operators, así que se pueden lanzar en paralelo.
  // Cuentas financieras para el filtro/export del Libro Mayor.
  // Cross-tenant: filtro explícito por org_id, no confiar en RLS.
  const accountsQuery = supabase
    .from("financial_accounts")
    .select("id, name, currency, agency_id")
    .eq("is_active", true)
    .eq("org_id", (user as any).org_id)
    .order("currency")
    .order("name")

  const [agencies, sellersRes, operatorsRes, accountsRes] = await Promise.all([
    getScopedAgenciesForUser(supabase, user),
    sellersQuery,
    supabase.from("operators").select("id, name").order("name"),
    accountsQuery,
  ])
  t.mark("parallel agencies+sellers+operators+accounts")
  const sellers = sellersRes.data
  const operators = operatorsRes.data

  // Cuentas visibles: las de las agencias del user + las compartidas (agency_id null).
  const scopedAgencyIds = new Set(agencies.map((a: any) => a.id))
  const accounts = (accountsRes.data || [])
    .filter((a: any) => !a.agency_id || scopedAgencyIds.has(a.agency_id))
    .map((a: any) => ({ id: a.id, name: a.name, currency: a.currency }))

  const showPartnerAccounts = ["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(user.role)

  t.end(`agencies=${agencies.length} sellers=${sellers?.length ?? 0} operators=${operators?.length ?? 0}`)

  return (
    <ContabilidadTabs
      initialTab={sp.tab}
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
        <LedgerPageClient
          agencies={agencies}
          accounts={accounts}
          initialAccountId={sp.accountId}
          initialCurrency={sp.currency}
          userRole={user.role}
        />
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
