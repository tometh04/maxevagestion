import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { TenantMetrics } from "@/components/admin/tenant-metrics"
import { CustomPlanForm } from "@/components/admin/custom-plan-form"
import { CustomPlanDisplay } from "@/components/admin/custom-plan-display"
import { ExtendTrialCard } from "@/components/admin/extend-trial-card"
import { CriticalActions } from "@/components/admin/critical-actions"
import { ManualPaymentsSection } from "@/components/admin/manual-payments-section"
import { MpSnapshot } from "@/components/admin/mp-snapshot"
import { AuditLogInline } from "@/components/admin/audit-log-inline"
import { OrgProfileCard } from "@/components/admin/org-profile-card"
import { OrgMembersCard } from "@/components/admin/org-members-card"

export const dynamic = "force-dynamic"

const STATUS_META: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Activa", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  TRIAL: { label: "En prueba", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  TRIALING: { label: "En prueba", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  PENDING_PAYMENT: { label: "Pendiente de pago", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  PAST_DUE: { label: "Cobro pendiente", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  SUSPENDED: { label: "Suspendida", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  CANCELLED: { label: "Cancelada", className: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
}

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

  const status = STATUS_META[org.subscription_status ?? ""] ?? {
    label: org.subscription_status ?? "—",
    className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/orgs"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition"
      >
        <ArrowLeft className="h-4 w-4" />
        Todas las organizaciones
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center text-blue-300 text-xl font-semibold shrink-0">
            {org.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-white tracking-tight">{org.name}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-400">
              <span className="font-mono">{org.slug}</span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-xs">{org.id}</span>
            </div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      <TenantMetrics orgId={id} />

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Billing</CardTitle>
          <CardDescription className="text-slate-400">
            Datos de facturación y estado de la suscripción.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <BillingField label="Plan base" value={org.plan ?? "—"} />
            <BillingField label="Status" value={status.label} />
            <BillingField
              label="Trial ends"
              value={org.trial_ends_at ? formatDate(org.trial_ends_at) : "—"}
            />
            <BillingField
              label="Grace ends"
              value={org.grace_period_ends_at ? formatDate(org.grace_period_ends_at) : "—"}
            />
            <BillingField label="Billing email" value={org.billing_email ?? "—"} />
            <BillingField label="CUIT" value={org.cuit ?? "—"} />
          </dl>
        </CardContent>
      </Card>

      <OrgProfileCard
        orgId={org.id}
        profile={{
          contact_name: org.contact_name,
          contact_phone: org.contact_phone,
          internal_notes: org.internal_notes,
          address_street: org.address_street,
          address_city: org.address_city,
          address_province: org.address_province,
          address_country: org.address_country,
          address_postal_code: org.address_postal_code,
          tax_category: org.tax_category,
          cuit: org.cuit,
          billing_email: org.billing_email,
          billing_name: org.billing_name,
        }}
      />

      <OrgMembersCard orgId={org.id} />

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

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Audit log</CardTitle>
          <CardDescription className="text-slate-400">Últimos 10 eventos registrados.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditLogInline orgId={id} />
        </CardContent>
      </Card>
    </div>
  )
}

function BillingField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-100">{value}</dd>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}
