import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function AdminMetricsPage() {
  const admin = createAdminClient() as any

  const [
    { count: totalOrgs },
    { count: activeOrgs },
    { count: trialOrgs },
    { count: pastDueOrgs },
    { count: suspendedOrgs },
    { count: totalUsers },
    { count: totalOperations },
  ] = await Promise.all([
    admin.from("organizations").select("*", { count: "exact", head: true }),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "ACTIVE"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "TRIAL"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "PAST_DUE"),
    admin.from("organizations").select("*", { count: "exact", head: true }).eq("subscription_status", "SUSPENDED"),
    admin.from("users").select("*", { count: "exact", head: true }).eq("is_active", true),
    admin.from("operations").select("*", { count: "exact", head: true }),
  ])

  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceIso = since.toISOString()

  const { count: signups30d } = await admin
    .from("organizations")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sinceIso)

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
