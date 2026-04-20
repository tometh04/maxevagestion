import Link from "next/link"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { AdminOrgActions } from "@/components/admin/org-actions"

export const dynamic = "force-dynamic"

export default async function AdminOrgDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient() as any

  const { data: org } = await admin
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (!org) notFound()

  const { count: memberCount } = await admin
    .from("organization_members")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", id)

  const { count: agencyCount } = await admin
    .from("agencies")
    .select("*", { count: "exact", head: true })
    .eq("org_id", id)

  const { count: opsCount } = await admin
    .from("operations")
    .select("*", { count: "exact", head: true })
    .eq("org_id", id)

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link href="/admin/orgs" className="text-sm text-blue-600 hover:underline">← Todas las orgs</Link>
        <h1 className="text-2xl font-semibold mt-2">{org.name}</h1>
        <p className="text-sm text-muted-foreground">{org.slug} · {org.id}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Miembros" value={memberCount ?? 0} max={org.max_users} />
        <StatCard label="Agencias" value={agencyCount ?? 0} max={org.max_agencies} />
        <StatCard label="Operaciones (total)" value={opsCount ?? 0} max={null} />
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold">Billing</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Plan</dt>
          <dd>{org.plan || "—"}</dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>{org.subscription_status || "—"}</dd>
          <dt className="text-muted-foreground">Trial ends</dt>
          <dd>{org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString() : "—"}</dd>
          <dt className="text-muted-foreground">Grace ends</dt>
          <dd>{org.grace_period_ends_at ? new Date(org.grace_period_ends_at).toLocaleDateString() : "—"}</dd>
          <dt className="text-muted-foreground">Billing email</dt>
          <dd>{org.billing_email || "—"}</dd>
          <dt className="text-muted-foreground">CUIT</dt>
          <dd>{org.cuit || "—"}</dd>
        </dl>
      </div>

      <AdminOrgActions orgId={org.id} currentStatus={org.subscription_status} currentPlan={org.plan} />
    </div>
  )
}

function StatCard({ label, value, max }: { label: string; value: number; max: number | null | undefined }) {
  const pct = max && max > 0 ? Math.min(100, Math.round((value / max) * 100)) : null
  return (
    <div className="border rounded-lg p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">
        {value}
        {max != null && <span className="text-sm text-muted-foreground font-normal"> / {max}</span>}
      </div>
      {pct != null && (
        <div className="h-1 bg-muted rounded mt-2">
          <div className="h-1 bg-blue-500 rounded" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}
