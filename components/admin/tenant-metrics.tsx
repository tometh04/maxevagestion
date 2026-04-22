import { Users, Building2, Briefcase, TrendingUp, DollarSign, Clock } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"

export async function TenantMetrics({ orgId }: { orgId: string }) {
  const admin = createAdminClient() as any

  const [membersQ, agenciesQ, opsTotalQ, opsMonthQ, lastActivityQ, mrrQ] = await Promise.all([
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
      .from("custom_plans")
      .select("base_price_ars, discount_percent")
      .eq("org_id", orgId)
      .maybeSingle(),
  ])

  const effectiveMrr = mrrQ.data
    ? Number(mrrQ.data.base_price_ars) * (1 - (mrrQ.data.discount_percent ?? 0) / 100)
    : null

  const cards = [
    { label: "Miembros", value: String(membersQ.count ?? 0), icon: Users },
    { label: "Agencias", value: String(agenciesQ.count ?? 0), icon: Building2 },
    { label: "Ops mes", value: String(opsMonthQ.count ?? 0), icon: TrendingUp },
    { label: "Ops total", value: String(opsTotalQ.count ?? 0), icon: Briefcase },
    {
      label: "MRR ARS",
      value: effectiveMrr != null ? `$${effectiveMrr.toLocaleString("es-AR")}` : "—",
      icon: DollarSign,
    },
    {
      label: "Último acceso",
      value: lastActivityQ.data?.updated_at
        ? new Date(lastActivityQ.data.updated_at).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "short",
          })
        : "—",
      icon: Clock,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
            <c.icon className="h-3.5 w-3.5" />
            {c.label}
          </div>
          <div className="text-xl font-semibold mt-2 text-white tabular-nums">{c.value}</div>
        </div>
      ))}
    </div>
  )
}
