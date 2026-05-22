import dynamic from "next/dynamic"
import { headers } from "next/headers"
import { DashboardFiltersState } from "@/components/dashboard/dashboard-filters"
import { ImportBanner } from "@/components/dashboard/import-banner"
import { AfipNotConfiguredBanner } from "@/components/dashboard/afip-not-configured-banner"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getAfipServiceForOrg } from "@/lib/afip/afip-service"
import { Skeleton } from "@/components/ui/skeleton"
import { makeTimer } from "@/lib/perf-log"
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist"

const DashboardPageClient = dynamic(
  () =>
    import("@/components/dashboard/dashboard-page-client").then((m) => ({
      default: m.DashboardPageClient,
    })),
  {
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
  const __perfReqId = (await headers()).get("x-perf-req-id") || undefined
  const t = makeTimer("page(dashboard)", __perfReqId)

  const { user } = await getCurrentUser()
  t.mark("getCurrentUser")
  const supabase = await createServerClient()
  t.mark("createServerClient")

  // PERF: paralelizamos lo que no tiene dependencias.
  // - SUPER_ADMIN: agencies(all) + user_agencies + sellers son independientes → 1 round-trip.
  // - Otros roles: user_agencies + sellers en paralelo, luego agencies scoped.
  const userRole = user.role as string

  // AFIP banner check: solo para roles admin con org_id. Disparamos en paralelo
  // con las queries de abajo y resolvemos al final. Si no aplica, Promise.resolve
  // garantiza que el await no agrega latencia.
  const isAdminRole = userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "ORG_OWNER"
  const afipCheckPromise: Promise<boolean> =
    isAdminRole && user.org_id
      ? getAfipServiceForOrg(supabase, user.org_id).then((svc) => svc === null).catch(() => false)
      : Promise.resolve(false)

  // 🔴 CROSS-TENANT FIX (2026-05-21): SUPER_ADMIN en Vibook es del TENANT
  // (no del platform). Filtro explícito por org_id obligatorio para evitar
  // leak de users/agencies cross-tenant. Ver CLAUDE.md regla de oro.
  let sellersQuery = supabase
    .from("users")
    .select("id, name")
    .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
    .eq("is_active", true)
    .eq("org_id", (user as any).org_id)
  if (userRole === "SELLER") {
    sellersQuery = sellersQuery.eq("id", user.id)
  }

  let agencies: Array<{ id: string; name: string }> = []
  let sellers: Array<{ id: string; name: string }> | null = null

  if (userRole === "SUPER_ADMIN") {
    const [agenciesRes, sellersRes] = await Promise.all([
      supabase
        .from("agencies")
        .select("id, name")
        .eq("org_id", (user as any).org_id)
        .order("name"),
      sellersQuery,
    ])
    agencies = (agenciesRes.data as any) || []
    sellers = (sellersRes.data as any) || []
    t.mark("parallel agencies+sellers (SUPER_ADMIN)")
  } else {
    const [userAgenciesRes, sellersRes] = await Promise.all([
      supabase.from("user_agencies").select("agency_id").eq("user_id", user.id),
      sellersQuery,
    ])
    sellers = (sellersRes.data as any) || []
    const userAgencies = userAgenciesRes.data
    t.mark("parallel user_agencies+sellers")

    if (userAgencies && userAgencies.length > 0) {
      const agencyIds = userAgencies.map((ua: any) => ua.agency_id)
      const { data } = await supabase.from("agencies").select("id, name").in("id", agencyIds)
      agencies = (data as any) || []
      t.mark("select agencies (scoped)")
    }
  }

  const afipNotConfigured = await afipCheckPromise
  t.mark("afip check")

  t.end(`agencies=${agencies.length} sellers=${sellers?.length ?? 0} role=${userRole} afipMissing=${afipNotConfigured}`)

  const dates = getDefaultDateRange()

  const defaultFilters: DashboardFiltersState = {
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    agencyId: "ALL",
    sellerId: "ALL",
  }

  return (
    <>
      <OnboardingChecklist userEmail={user.email} />
      {afipNotConfigured && user.org_id && (
        <AfipNotConfiguredBanner orgId={user.org_id} />
      )}
      <ImportBanner />
      <DashboardPageClient
        agencies={agencies}
        sellers={(sellers || []).map((s: any) => ({ id: s.id, name: s.name }))}
        defaultFilters={defaultFilters}
        userRole={userRole}
      />
    </>
  )
}

