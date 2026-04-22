import Link from "next/link"
import { ChevronRight, Users, Building, Gauge } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

interface OrgRow {
  id: string
  slug: string
  name: string
  plan: string | null
  subscription_status: string | null
  max_users: number | null
  max_agencies: number | null
  max_operations_per_month: number | null
  trial_ends_at: string | null
  created_at: string
}

const STATUS_META: Record<
  string,
  { label: string; tone: "default" | "secondary" | "destructive" | "outline"; dot: string }
> = {
  ACTIVE: { label: "Activa", tone: "default", dot: "bg-emerald-500" },
  TRIAL: { label: "En prueba", tone: "secondary", dot: "bg-blue-500" },
  TRIALING: { label: "En prueba", tone: "secondary", dot: "bg-blue-500" },
  PENDING_PAYMENT: { label: "Pendiente de pago", tone: "outline", dot: "bg-amber-500" },
  PAST_DUE: { label: "Cobro pendiente", tone: "destructive", dot: "bg-amber-500" },
  SUSPENDED: { label: "Suspendida", tone: "destructive", dot: "bg-red-500" },
  CANCELLED: { label: "Cancelada", tone: "outline", dot: "bg-slate-500" },
}

const PLAN_META: Record<string, { label: string; className: string }> = {
  ENTERPRISE: { label: "Enterprise", className: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" },
  PRO: { label: "PRO", className: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  STARTER: { label: "Starter", className: "bg-slate-500/20 text-slate-300 border-slate-500/40" },
}

export default async function AdminOrgsPage() {
  const admin = createAdminClient() as any
  const { data: orgs } = await admin
    .from("organizations")
    .select(
      "id, slug, name, plan, subscription_status, max_users, max_agencies, max_operations_per_month, trial_ends_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200)

  const rows = (orgs || []) as OrgRow[]

  const counts = {
    total: rows.length,
    active: rows.filter((r) => r.subscription_status === "ACTIVE").length,
    trial: rows.filter((r) => r.subscription_status === "TRIAL" || r.subscription_status === "TRIALING")
      .length,
    pending: rows.filter((r) => r.subscription_status === "PENDING_PAYMENT").length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Organizaciones</h1>
        <p className="text-sm text-slate-400 mt-1">
          Gestión de tenants, planes custom y estado de suscripción.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tenants totales" value={counts.total} />
        <StatCard label="Activas" value={counts.active} tone="emerald" />
        <StatCard label="En trial" value={counts.trial} tone="blue" />
        <StatCard label="Pendientes de pago" value={counts.pending} tone="amber" />
      </div>

      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="border-b border-slate-800">
          <CardTitle className="text-white">Listado de tenants</CardTitle>
          <CardDescription className="text-slate-400">
            Click en cualquier fila para ver el detalle completo: métricas, plan custom, acciones críticas y audit log.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-800">
            {rows.map((org) => {
              const status = STATUS_META[org.subscription_status ?? ""] ?? {
                label: org.subscription_status ?? "—",
                tone: "outline" as const,
                dot: "bg-slate-500",
              }
              const plan = PLAN_META[org.plan ?? ""] ?? {
                label: org.plan ?? "—",
                className: "bg-slate-500/20 text-slate-300 border-slate-500/40",
              }

              return (
                <Link
                  key={org.id}
                  href={`/admin/orgs/${org.id}`}
                  className="group flex items-center gap-4 px-5 py-4 hover:bg-slate-800/40 transition"
                >
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center text-blue-300 font-semibold shrink-0">
                    {org.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white truncate">{org.name}</span>
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded border ${plan.className}`}>
                        {plan.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">{org.slug} · creada {formatDate(org.created_at)}</div>
                  </div>

                  <div className="hidden md:flex items-center gap-4 text-xs text-slate-400">
                    <Metric icon={Users} value={fmtLimit(org.max_users)} tooltip="Usuarios" />
                    <Metric icon={Building} value={fmtLimit(org.max_agencies)} tooltip="Agencias" />
                    <Metric icon={Gauge} value={fmtLimit(org.max_operations_per_month) + "/mo"} tooltip="Ops" />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                    <Badge variant={status.tone} className="font-normal">
                      {status.label}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-300 transition" />
                  </div>
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone = "slate",
}: {
  label: string
  value: number
  tone?: "slate" | "emerald" | "blue" | "amber"
}) {
  const toneMap = {
    slate: "text-slate-100",
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    amber: "text-amber-400",
  }
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${toneMap[tone]}`}>{value}</div>
    </div>
  )
}

function Metric({
  icon: Icon,
  value,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: string
  tooltip: string
}) {
  return (
    <div className="flex items-center gap-1.5" title={tooltip}>
      <Icon className="h-3.5 w-3.5 text-slate-500" />
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function fmtLimit(n: number | null): string {
  if (n == null) return "—"
  if (n >= 999) return "∞"
  return String(n)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}
