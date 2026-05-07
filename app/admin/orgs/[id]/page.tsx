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
import { OrgActivityTimeline } from "@/components/admin/org-activity-timeline"
import { PageHeader } from "@/components/admin/page-header"
import { MrrOverrideCard } from "@/components/admin/mrr-override-card"

export const dynamic = "force-dynamic"

const STATUS_META: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Activa", className: "bg-success/15 text-success border-success/30" },
  TRIAL: { label: "En prueba", className: "bg-primary/15 text-primary border-primary/30" },
  TRIALING: { label: "En prueba", className: "bg-primary/15 text-primary border-primary/30" },
  PENDING_PAYMENT: { label: "Pendiente de pago", className: "bg-accent-coral/15 text-accent-coral border-accent-coral/30" },
  PAST_DUE: { label: "Cobro pendiente", className: "bg-accent-coral/15 text-accent-coral border-accent-coral/30" },
  SUSPENDED: { label: "Suspendida", className: "bg-destructive/15 text-destructive border-destructive/30" },
  CANCELLED: { label: "Cancelada", className: "bg-muted-foreground/15 text-muted-foreground border-border/60" },
}

export default async function AdminOrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient() as any

  const { data: org } = await admin.from("organizations").select("*").eq("id", id).maybeSingle()
  if (!org) notFound()

  // Fetch tenant profile settings from organization_settings
  const { data: settingsRows } = await admin
    .from("organization_settings")
    .select("key, value")
    .eq("org_id", org.id)
    .in("key", [
      "company_name",
      "company_tax_id", "tax_id",
      "company_legajo", "legajo",
      "company_address", "address",
      "company_phone", "phone",
      "company_email", "email",
      "company_website", "website",
      "company_instagram", "instagram",
    ])

  const sMap: Record<string, string> = {}
  for (const r of (settingsRows ?? [])) sMap[r.key] = r.value

  const orgSettings = {
    company_name: sMap["company_name"] ?? null,
    tax_id: sMap["tax_id"] ?? sMap["company_tax_id"] ?? null,
    legajo: sMap["legajo"] ?? sMap["company_legajo"] ?? null,
    address: sMap["address"] ?? sMap["company_address"] ?? null,
    phone: sMap["phone"] ?? sMap["company_phone"] ?? null,
    email: sMap["email"] ?? sMap["company_email"] ?? null,
    website: sMap["website"] ?? sMap["company_website"] ?? null,
    instagram: sMap["instagram"] ?? sMap["company_instagram"] ?? null,
  }

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
    className: "bg-muted-foreground/15 text-muted-foreground border-border/60",
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={org.name}
        description={`Slug: ${org.slug} · ID: ${org.id} · Plan: ${org.plan ?? "—"} · Estado: ${status.label}`}
        actions={
          <>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${status.className}`}
            >
              {status.label}
            </span>
            <Link
              href="/admin/orgs"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-muted-foreground transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al listado
            </Link>
          </>
        }
      />

      <TenantMetrics orgId={id} />

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground text-base">Billing</CardTitle>
          <CardDescription className="text-muted-foreground">
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

      <MrrOverrideCard
        orgId={org.id}
        currentOverride={
          org.manual_mrr_override_ars != null
            ? Number(org.manual_mrr_override_ars)
            : null
        }
        hasCustomPlan={!!org.custom_plan_id}
      />

      <OrgProfileCard
        orgId={org.id}
        settings={orgSettings}
        internalNotes={org.internal_notes ?? null}
      />

      <OrgMembersCard orgId={org.id} />

      <OrgActivityTimeline orgId={org.id} />

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

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground text-base">Audit log</CardTitle>
          <CardDescription className="text-muted-foreground">Últimos 10 eventos registrados.</CardDescription>
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
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-muted-foreground">{value}</dd>
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
