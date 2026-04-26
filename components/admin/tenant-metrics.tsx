import { Users, Building2, Briefcase, TrendingUp, CircleDollarSign, Clock } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { StatCard } from "@/components/admin/stat-card"
import { formatArs } from "@/lib/billing/plans"
import { computeMrrArs, type MrrOrg, type MrrCustomPlan } from "@/lib/admin/metrics"

export async function TenantMetrics({ orgId }: { orgId: string }) {
  const admin = createAdminClient() as any

  const [membersQ, agenciesQ, opsTotalQ, opsMonthQ, lastActivityQ, orgQ, customPlanQ] = await Promise.all([
    admin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId),
    admin.from("agencies").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("operations").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    admin
      .from("operations")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    admin
      .from("users")
      .select("updated_at")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("plan, subscription_status, custom_plan_id, manual_mrr_override_ars")
      .eq("id", orgId)
      .maybeSingle(),
    admin
      .from("custom_plans")
      .select("base_price_ars, discount_percent, discount_ends_at")
      .eq("org_id", orgId)
      .maybeSingle(),
  ])

  const mrrOrg: MrrOrg = orgQ.data ?? {
    plan: null,
    subscription_status: "FREE",
    custom_plan_id: null,
    manual_mrr_override_ars: null,
  }
  const mrrCp: MrrCustomPlan | null = customPlanQ.data ?? null
  const effectiveMrr = computeMrrArs(mrrOrg, mrrCp)

  const lastAccessValue = lastActivityQ.data?.updated_at
    ? `último: ${new Date(lastActivityQ.data.updated_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "short",
      })}`
    : "—"

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <StatCard label="Miembros" value={membersQ.count ?? 0} icon={Users} />
      <StatCard label="Agencias" value={agenciesQ.count ?? 0} icon={Building2} />
      <StatCard label="Ops mes" value={opsMonthQ.count ?? 0} icon={TrendingUp} hint="últimos 30 días" />
      <StatCard label="Ops total" value={opsTotalQ.count ?? 0} icon={Briefcase} />
      <StatCard
        label="MRR ARS"
        value={effectiveMrr > 0 ? formatArs(effectiveMrr) : "—"}
        icon={CircleDollarSign}
        hint="ARS/mes"
      />
      <StatCard label="Último acceso" value={lastAccessValue} icon={Clock} />
    </div>
  )
}
