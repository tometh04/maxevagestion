import Link from "next/link"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { TenantMetrics } from "@/components/admin/tenant-metrics"
import { CustomPlanForm } from "@/components/admin/custom-plan-form"
import { CustomPlanDisplay } from "@/components/admin/custom-plan-display"
import { ExtendTrialCard } from "@/components/admin/extend-trial-card"
import { CriticalActions } from "@/components/admin/critical-actions"
import { ManualPaymentsSection } from "@/components/admin/manual-payments-section"
import { MpSnapshot } from "@/components/admin/mp-snapshot"
import { AuditLogInline } from "@/components/admin/audit-log-inline"

export const dynamic = "force-dynamic"

export default async function AdminOrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient() as any

  const { data: org } = await admin.from("organizations").select("*").eq("id", id).maybeSingle()
  if (!org) notFound()

  let customPlan: any = null
  if (org.custom_plan_id) {
    const r = await admin.from("custom_plans").select("*").eq("id", org.custom_plan_id).maybeSingle()
    customPlan = r.data
  }

  let manualPayments: any[] = []
  if (customPlan?.billing_method === "MANUAL") {
    const r = await admin
      .from("manual_payments")
      .select("*")
      .eq("org_id", id)
      .order("paid_at", { ascending: false })
      .limit(20)
    manualPayments = r.data ?? []
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <Link href="/admin/orgs" className="text-sm text-blue-600 hover:underline">
          ← Todas las orgs
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{org.name}</h1>
        <p className="text-sm text-muted-foreground">
          {org.slug} · {org.id}
        </p>
      </div>

      <TenantMetrics orgId={id} />

      <div className="border rounded-lg p-4 space-y-2">
        <h2 className="font-semibold">Billing</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Plan base</dt>
          <dd>{org.plan || "—"}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>{org.subscription_status || "—"}</dd>
          <dt className="text-muted-foreground">Trial ends</dt>
          <dd>{org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString("es-AR") : "—"}</dd>
          <dt className="text-muted-foreground">Grace ends</dt>
          <dd>
            {org.grace_period_ends_at
              ? new Date(org.grace_period_ends_at).toLocaleDateString("es-AR")
              : "—"}
          </dd>
          <dt className="text-muted-foreground">Billing email</dt>
          <dd>{org.billing_email || "—"}</dd>
          <dt className="text-muted-foreground">CUIT</dt>
          <dd>{org.cuit || "—"}</dd>
        </dl>
      </div>

      {customPlan ? (
        <CustomPlanDisplay orgId={id} plan={customPlan} />
      ) : (
        <CustomPlanForm orgId={id} />
      )}

      <ExtendTrialCard orgId={id} currentTrialEndsAt={org.trial_ends_at} />

      <CriticalActions orgId={id} orgName={org.name} currentStatus={org.subscription_status} />

      {customPlan?.billing_method === "MANUAL" && (
        <ManualPaymentsSection orgId={id} payments={manualPayments} />
      )}

      <MpSnapshot orgId={id} />

      <div className="border rounded-lg p-4">
        <h2 className="font-semibold mb-2">Audit log (últimos 10)</h2>
        <AuditLogInline orgId={id} />
      </div>
    </div>
  )
}
