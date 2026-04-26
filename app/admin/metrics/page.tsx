import { createAdminClient } from "@/lib/supabase/server"
import { computeMrrArs, type MrrOrg, type MrrCustomPlan } from "@/lib/admin/metrics"
import { formatArs } from "@/lib/billing/plans"

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

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-semibold">Platform metrics</h1>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Tenants por estado</h2>
        <div className="grid grid-cols-5 gap-3">
          <Metric label="Total" value={totalOrgs} />
          <Metric label="ACTIVE" value={activeOrgs} />
          <Metric label="TRIAL" value={trialOrgs} />
          <Metric label="PAST_DUE" value={pastDueOrgs} />
          <Metric label="SUSPENDED" value={suspendedOrgs} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Actividad global</h2>
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Users activos" value={totalUsers} />
          <Metric label="Operaciones totales" value={totalOperations} />
          <Metric label="Signups últimos 30d" value={signups30d} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Revenue</h2>
        <div className="grid grid-cols-4 gap-3">
          <MetricText label="MRR" value={formatArs(totalMrr)} />
          <MetricText label="ARR" value={formatArs(totalArr)} />
          <MetricText label="Avg MRR / org pagadora" value={formatArs(avgMrrPerOrg)} />
          <Metric label="Churn últimos 30d" value={churn30d} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Breakdown por plan</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Plan</th>
                <th className="text-right px-4 py-2 font-medium">Orgs</th>
                <th className="text-right px-4 py-2 font-medium">MRR</th>
                <th className="text-right px-4 py-2 font-medium">% del MRR</th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map(({ label, key }) => {
                const row = breakdown[key]
                const pct = totalMrr > 0 ? ((row.mrr / totalMrr) * 100).toFixed(1) : "0.0"
                return (
                  <tr key={key} className="border-t">
                    <td className="px-4 py-2">{label}</td>
                    <td className="px-4 py-2 text-right">{row.count}</td>
                    <td className="px-4 py-2 text-right">{formatArs(row.mrr)}</td>
                    <td className="px-4 py-2 text-right">{pct}%</td>
                  </tr>
                )
              })}
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right">{(allOrgs ?? []).length}</td>
                <td className="px-4 py-2 text-right">{formatArs(totalMrr)}</td>
                <td className="px-4 py-2 text-right">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value ?? 0}</div>
    </div>
  )
}

function MetricText({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  )
}
