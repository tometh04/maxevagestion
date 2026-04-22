import { createAdminClient } from "@/lib/supabase/server"

export async function TenantMetrics({ orgId }: { orgId: string }) {
  const admin = createAdminClient() as any

  const [membersQ, agenciesQ, opsTotalQ, opsMonthQ, lastActivityQ, mrrQ] = await Promise.all([
    admin.from("organization_members").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
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
      .from("custom_plans")
      .select("base_price_ars, discount_percent")
      .eq("org_id", orgId)
      .maybeSingle(),
  ])

  const effectiveMrr = mrrQ.data
    ? Number(mrrQ.data.base_price_ars) * (1 - (mrrQ.data.discount_percent ?? 0) / 100)
    : null

  const cards = [
    { label: "Miembros", value: membersQ.count ?? 0 },
    { label: "Agencias", value: agenciesQ.count ?? 0 },
    { label: "Ops mes", value: opsMonthQ.count ?? 0 },
    { label: "Ops total", value: opsTotalQ.count ?? 0 },
    {
      label: "MRR ARS",
      value: effectiveMrr != null ? effectiveMrr.toLocaleString("es-AR") : "—",
    },
    {
      label: "Último acceso",
      value: lastActivityQ.data?.updated_at
        ? new Date(lastActivityQ.data.updated_at).toLocaleDateString("es-AR")
        : "—",
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="border rounded-lg p-3">
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div className="text-xl font-semibold mt-1">{c.value}</div>
        </div>
      ))}
    </div>
  )
}
