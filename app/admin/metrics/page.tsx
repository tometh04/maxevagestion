import { createAdminClient } from "@/lib/supabase/server"
import { computeMrrArs, type MrrOrg, type MrrCustomPlan } from "@/lib/admin/metrics"
import { formatArs } from "@/lib/billing/plans"
import {
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Ban,
  UserCheck,
  Briefcase,
  Sparkles,
  CircleDollarSign,
  TrendingUp,
  LineChart,
  TrendingDown,
} from "lucide-react"
import { PageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import {
  DataTableShell,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableTh,
  DataTableTd,
} from "@/components/admin/data-table-shell"
import { MrrBarChart } from "@/components/admin/mrr-bar-chart"

export const dynamic = "force-dynamic"

type OrgRow = {
  id: string
  plan: string | null
  subscription_status: string
  custom_plan_id: string | null
  updated_at: string
}

type CustomPlanRow = {
  org_id: string
  base_price_ars: number
  discount_percent: number
  discount_ends_at: string | null
}

export default async function AdminMetricsPage() {
  const admin = createAdminClient() as any

  const since30d = new Date()
  since30d.setDate(since30d.getDate() - 30)
  const sinceIso = since30d.toISOString()

  const [
    { count: totalOrgs },
    { count: activeOrgs },
    { count: trialOrgs },
    { count: pastDueOrgs },
    { count: suspendedOrgs },
    { count: totalUsers },
    { count: totalOperations },
    { count: signups30d },
    { data: allOrgs },
    { data: customPlansRaw },
    { count: churn30d },
  ] = await Promise.all([
    admin.from("organizations").select("*", { count: "exact", head: true }),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "ACTIVE"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "TRIAL"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "PAST_DUE"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "SUSPENDED"),
    admin.from("users").select("*", { count: "exact", head: true }).eq("is_active", true),
    admin.from("operations").select("*", { count: "exact", head: true }),
    admin.from("organizations").select("*", { count: "exact", head: true }).gte("created_at", sinceIso),
    admin.from("organizations").select("id, plan, subscription_status, custom_plan_id, updated_at"),
    admin.from("custom_plans").select("org_id, base_price_ars, discount_percent, discount_ends_at"),
    admin
      .from("organizations")
      .select("*", { count: "exact", head: true })
      .in("subscription_status", ["CANCELLED", "SUSPENDED"])
      .gte("updated_at", sinceIso),
  ])

  // Build custom_plans lookup map
  const customPlansMap = new Map<string, MrrCustomPlan>()
  for (const cp of (customPlansRaw ?? []) as CustomPlanRow[]) {
    customPlansMap.set(cp.org_id, {
      base_price_ars: cp.base_price_ars,
      discount_percent: cp.discount_percent,
      discount_ends_at: cp.discount_ends_at,
    })
  }

  // Compute MRR per org
  type PlanKey = "STARTER" | "PRO" | "ENTERPRISE_CUSTOM" | "ENTERPRISE_NO_CUSTOM" | "OTHER"

  const breakdown: Record<PlanKey, { count: number; mrr: number }> = {
    STARTER: { count: 0, mrr: 0 },
    PRO: { count: 0, mrr: 0 },
    ENTERPRISE_CUSTOM: { count: 0, mrr: 0 },
    ENTERPRISE_NO_CUSTOM: { count: 0, mrr: 0 },
    OTHER: { count: 0, mrr: 0 },
  }

  let totalMrr = 0
  let payingOrgCount = 0

  for (const org of (allOrgs ?? []) as OrgRow[]) {
    const customPlan = org.custom_plan_id ? (customPlansMap.get(org.id) ?? null) : null
    const mrr = computeMrrArs(org as MrrOrg, customPlan)

    if (mrr > 0) {
      totalMrr += mrr
      payingOrgCount++
    }

    // Breakdown assignment (all orgs, not just paying)
    let key: PlanKey
    if (org.custom_plan_id) {
      key = "ENTERPRISE_CUSTOM"
    } else if (org.plan === "STARTER") {
      key = "STARTER"
    } else if (org.plan === "PRO") {
      key = "PRO"
    } else if (org.plan === "ENTERPRISE") {
      key = "ENTERPRISE_NO_CUSTOM"
    } else {
      key = "OTHER"
    }

    breakdown[key].count++
    breakdown[key].mrr += mrr
  }

  const totalArr = totalMrr * 12
  const avgMrrPerOrg = payingOrgCount > 0 ? Math.round(totalMrr / payingOrgCount) : 0

  const breakdownRows: { label: string; key: PlanKey }[] = [
    { label: "STARTER", key: "STARTER" },
    { label: "PRO", key: "PRO" },
    { label: "ENTERPRISE (custom plan)", key: "ENTERPRISE_CUSTOM" },
    { label: "ENTERPRISE (sin custom plan)", key: "ENTERPRISE_NO_CUSTOM" },
    { label: "Otros", key: "OTHER" },
  ]

  const chartData = breakdownRows.map(({ label, key }) => ({
    label,
    mrr: breakdown[key].mrr,
  }))

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Platform metrics"
        description="Vista global del SaaS — orgs por estado, MRR/ARR, breakdown por plan."
      />

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Tenants por estado</h2>
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="Total" value={totalOrgs ?? 0} icon={Users} />
          <StatCard label="ACTIVE" value={activeOrgs ?? 0} icon={CheckCircle2} />
          <StatCard label="TRIAL" value={trialOrgs ?? 0} icon={Clock} />
          <StatCard label="PAST_DUE" value={pastDueOrgs ?? 0} icon={AlertCircle} />
          <StatCard label="SUSPENDED" value={suspendedOrgs ?? 0} icon={Ban} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Actividad global</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Users activos" value={totalUsers ?? 0} icon={UserCheck} />
          <StatCard label="Operaciones totales" value={totalOperations ?? 0} icon={Briefcase} />
          <StatCard label="Signups últimos 30d" value={signups30d ?? 0} icon={Sparkles} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Revenue</h2>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="MRR" value={formatArs(totalMrr)} icon={CircleDollarSign} />
          <StatCard label="ARR" value={formatArs(totalArr)} icon={TrendingUp} />
          <StatCard label="Avg MRR / org pagadora" value={formatArs(avgMrrPerOrg)} icon={LineChart} />
          <StatCard label="Churn últimos 30d" value={churn30d ?? 0} icon={TrendingDown} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Breakdown por plan</h2>
        <DataTableShell>
          <DataTableHead>
            <tr>
              <DataTableTh>Plan</DataTableTh>
              <DataTableTh className="text-right">Orgs</DataTableTh>
              <DataTableTh className="text-right">MRR</DataTableTh>
              <DataTableTh className="text-right">% del MRR</DataTableTh>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {breakdownRows.map(({ label, key }) => {
              const row = breakdown[key]
              const pct = totalMrr > 0 ? ((row.mrr / totalMrr) * 100).toFixed(1) : "0.0"
              return (
                <DataTableRow key={key}>
                  <DataTableTd>{label}</DataTableTd>
                  <DataTableTd className="text-right">{row.count}</DataTableTd>
                  <DataTableTd className="text-right">{formatArs(row.mrr)}</DataTableTd>
                  <DataTableTd className="text-right">{pct}%</DataTableTd>
                </DataTableRow>
              )
            })}
            <DataTableRow className="font-medium bg-slate-900/60">
              <DataTableTd>Total</DataTableTd>
              <DataTableTd className="text-right">{(allOrgs ?? []).length}</DataTableTd>
              <DataTableTd className="text-right">{formatArs(totalMrr)}</DataTableTd>
              <DataTableTd className="text-right">100%</DataTableTd>
            </DataTableRow>
          </DataTableBody>
        </DataTableShell>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">MRR por plan</h2>
        <div className="rounded-lg border border-slate-800/80 bg-slate-900/40 p-4">
          <MrrBarChart data={chartData} />
        </div>
      </section>
    </div>
  )
}
