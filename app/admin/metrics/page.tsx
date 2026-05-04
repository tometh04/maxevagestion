import {
  AlertCircle, Ban, Briefcase, CheckCircle2, CircleDollarSign, Clock,
  LineChart, Sparkles, TrendingDown, TrendingUp, UserCheck, Users, Wallet,
} from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import {
  DataTableShell, DataTableHead, DataTableBody, DataTableRow, DataTableTh, DataTableTd,
} from "@/components/admin/data-table-shell"
import { EmptyState } from "@/components/admin/empty-state"
import { EnterpriseWithoutPriceAlert } from "@/components/admin/enterprise-without-price-alert"
import { MpSandboxBanner } from "@/components/admin/mp-sandbox-banner"
import { MrrBarChart } from "@/components/admin/mrr-bar-chart"
import { formatArs, PLANS } from "@/lib/billing/plans"
import {
  computeMrrArsDetailed, computeTrialPipelineMrrArs, computePotentialMrrArs,
  type MrrOrg, type MrrCustomPlan,
} from "@/lib/admin/metrics"

export const dynamic = "force-dynamic"

export default async function AdminMetricsPage() {
  const admin = createAdminClient() as any
  const since30d = new Date(Date.now() - 30 * 86400 * 1000).toISOString()

  // === Counts por status ===
  const [
    { count: totalOrgs },
    { count: activeOrgs },
    { count: trialingOrgs },
    { count: trialLegacyOrgs },
    { count: pastDueOrgs },
    { count: pendingPaymentOrgs },
    { count: suspendedOrgs },
    { count: cancelledOrgs },
    { count: totalUsers },
    { count: totalOperations },
    { count: signups30d },
  ] = await Promise.all([
    admin.from("organizations").select("*", { count: "exact", head: true }),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "ACTIVE"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "TRIALING"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "TRIAL"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "PAST_DUE"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "PENDING_PAYMENT"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "SUSPENDED"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "CANCELLED"),
    admin.from("users").select("*", { count: "exact", head: true }).eq("is_active", true),
    admin.from("operations").select("*", { count: "exact", head: true }),
    admin.from("organizations").select("*", { count: "exact", head: true }).gte("created_at", since30d),
  ])

  // === Data para cálculos ===
  const [
    { data: orgsForMrr },
    { data: customPlans },
    { data: orgsForChurn },
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("id, plan, subscription_status, custom_plan_id, manual_mrr_override_ars, created_at, updated_at"),
    admin
      .from("custom_plans")
      .select("org_id, base_price_ars, discount_percent, discount_ends_at"),
    admin
      .from("organizations")
      .select("id, plan, subscription_status, custom_plan_id, manual_mrr_override_ars, updated_at")
      .in("subscription_status", ["CANCELLED", "SUSPENDED"])
      .gte("updated_at", since30d),
  ])

  const cpMap = new Map<string, MrrCustomPlan>()
  for (const cp of (customPlans ?? []) as any[]) {
    cpMap.set(cp.org_id, {
      base_price_ars: Number(cp.base_price_ars),
      discount_percent: cp.discount_percent,
      discount_ends_at: cp.discount_ends_at,
    })
  }

  let mrrTotal = 0
  let mrrEstimated = 0       // Bug #4: monto estimado (ENTERPRISE fallback)
  let mrrEstimatedOrgs = 0   // count de orgs con monto estimado
  let trialPipelineMrr = 0
  let newMrr30d = 0
  let activePayingOrgs = 0
  const mrrByPlan = new Map<string, { count: number; mrr: number }>()

  for (const o of (orgsForMrr ?? []) as any[]) {
    const org: MrrOrg = {
      plan: o.plan,
      subscription_status: o.subscription_status,
      custom_plan_id: o.custom_plan_id,
      manual_mrr_override_ars: o.manual_mrr_override_ars != null ? Number(o.manual_mrr_override_ars) : null,
    }
    const cp = o.custom_plan_id ? cpMap.get(o.id) ?? null : null

    const { amount: mrr, estimated } = computeMrrArsDetailed(org, cp)
    mrrTotal += mrr
    if (mrr > 0) activePayingOrgs += 1
    if (estimated) {
      mrrEstimated += mrr
      mrrEstimatedOrgs += 1
    }

    const pipeline = computeTrialPipelineMrrArs(org, cp)
    trialPipelineMrr += pipeline

    if (mrr > 0 && new Date(o.created_at).getTime() >= Date.parse(since30d)) {
      newMrr30d += mrr
    }

    const bucketKey = o.custom_plan_id ? "CUSTOM" : (o.plan ?? "OTHER")
    if (mrr > 0) {
      const bucket = mrrByPlan.get(bucketKey) ?? { count: 0, mrr: 0 }
      bucket.count += 1
      bucket.mrr += mrr
      mrrByPlan.set(bucketKey, bucket)
    }
  }

  let churnMrr30d = 0
  for (const o of (orgsForChurn ?? []) as any[]) {
    const org: MrrOrg = {
      plan: o.plan,
      subscription_status: o.subscription_status,
      custom_plan_id: o.custom_plan_id,
      manual_mrr_override_ars: o.manual_mrr_override_ars != null ? Number(o.manual_mrr_override_ars) : null,
    }
    const cp = o.custom_plan_id ? cpMap.get(o.id) ?? null : null
    churnMrr30d += computePotentialMrrArs(org, cp)
  }

  const arr = mrrTotal * 12
  const avgMrrPerActiveOrg = activePayingOrgs > 0 ? Math.round(mrrTotal / activePayingOrgs) : 0

  const breakdown = Array.from(mrrByPlan.entries())
    .map(([key, v]) => ({
      label: key === "CUSTOM" ? "Custom plan" : (PLANS[key as keyof typeof PLANS]?.name ?? key),
      count: v.count,
      mrr: v.mrr,
      pct: mrrTotal > 0 ? (v.mrr / mrrTotal) * 100 : 0,
    }))
    .sort((a, b) => b.mrr - a.mrr)

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Platform metrics"
        description="Vista global del SaaS — orgs por estado, MRR/ARR, breakdown por plan."
      />

      <MpSandboxBanner />
      <EnterpriseWithoutPriceAlert />

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Tenants por estado</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Total" value={totalOrgs ?? 0} icon={Users} />
          <StatCard label="ACTIVE" value={activeOrgs ?? 0} icon={CheckCircle2} />
          <StatCard label="TRIALING" value={trialingOrgs ?? 0} icon={Clock} />
          <StatCard label="PENDING" value={pendingPaymentOrgs ?? 0} icon={AlertCircle} />
          <StatCard label="PAST_DUE" value={pastDueOrgs ?? 0} icon={AlertCircle} />
          <StatCard label="SUSPENDED" value={suspendedOrgs ?? 0} icon={Ban} />
          <StatCard label="CANCELLED" value={cancelledOrgs ?? 0} icon={Ban} />
        </div>
        {(trialLegacyOrgs ?? 0) > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Legacy TRIAL: {trialLegacyOrgs} (deberían migrarse a TRIALING o PENDING_PAYMENT)
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Actividad global</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard label="Users activos" value={totalUsers ?? 0} icon={UserCheck} />
          <StatCard label="Operaciones totales" value={totalOperations ?? 0} icon={Briefcase} />
          <StatCard label="Signups últimos 30d" value={signups30d ?? 0} icon={Sparkles} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Revenue</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="MRR"
            value={formatArs(mrrTotal)}
            icon={CircleDollarSign}
            hint={
              mrrEstimatedOrgs > 0
                ? `ARS / mes · ${formatArs(mrrEstimated)} estimado en ${mrrEstimatedOrgs} Enterprise sin precio`
                : "ARS / mes"
            }
          />
          <StatCard
            label="ARR"
            value={formatArs(arr)}
            icon={TrendingUp}
            hint="ARS / año"
          />
          <StatCard
            label="Avg MRR / org"
            value={formatArs(avgMrrPerActiveOrg)}
            icon={LineChart}
            hint={`${activePayingOrgs} orgs pagando`}
          />
          <StatCard
            label="Pipeline MRR"
            value={formatArs(trialPipelineMrr)}
            icon={Wallet}
            hint={`${trialingOrgs ?? 0} en TRIALING`}
          />
          <StatCard
            label="New MRR 30d"
            value={formatArs(newMrr30d)}
            icon={TrendingUp}
            hint="orgs nuevas pagando"
          />
          <StatCard
            label="Churn MRR 30d"
            value={formatArs(churnMrr30d)}
            icon={TrendingDown}
            hint="orgs canceladas/suspendidas"
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Breakdown por plan</h2>
        {breakdown.length === 0 ? (
          <EmptyState
            icon={CircleDollarSign}
            title="Sin MRR por plan"
            description="Cuando haya orgs pagando aparecerán acá."
          />
        ) : (
          <>
            <DataTableShell>
              <DataTableHead>
                <tr>
                  <DataTableTh>Plan</DataTableTh>
                  <DataTableTh>Orgs pagando</DataTableTh>
                  <DataTableTh>MRR</DataTableTh>
                  <DataTableTh>% del total</DataTableTh>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {breakdown.map((b) => (
                  <DataTableRow key={b.label}>
                    <DataTableTd className="font-medium text-muted-foreground">{b.label}</DataTableTd>
                    <DataTableTd>{b.count}</DataTableTd>
                    <DataTableTd>{formatArs(b.mrr)}</DataTableTd>
                    <DataTableTd className="text-muted-foreground">{b.pct.toFixed(1)}%</DataTableTd>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTableShell>
            <div className="mt-4">
              <MrrBarChart data={breakdown.map((b) => ({ label: b.label, mrr: b.mrr }))} />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
