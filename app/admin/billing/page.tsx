import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatArs } from "@/lib/billing/plans"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const EVENT_COLORS: Record<string, string> = {
  PAYMENT_APPROVED: "bg-emerald-500/15 text-emerald-300",
  SUBSCRIPTION_AUTHORIZED: "bg-emerald-500/15 text-emerald-300",
  PAYMENT_REJECTED: "bg-red-500/15 text-red-300",
  SUBSCRIPTION_PAUSED: "bg-red-500/15 text-red-300",
  SUBSCRIPTION_CANCELLED: "bg-red-500/15 text-red-300",
  CHECKOUT_INITIATED: "bg-blue-500/15 text-blue-300",
  MP_WEBHOOK: "bg-blue-500/15 text-blue-300",
  SUBSCRIPTION_CREATED: "bg-blue-500/15 text-blue-300",
  MANUAL_ADMIN_ADJUSTMENT: "bg-amber-500/15 text-amber-300",
}

export default async function AdminBillingPage() {
  const admin = createAdminClient() as any
  const now = new Date()
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    { data: pending },
    { data: upcoming },
    { data: customPlans },
    { data: events },
    { data: orgsForJoin },
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, subscription_status, plan, current_period_ends_at, mp_preapproval_id, updated_at")
      .in("subscription_status", ["PENDING_PAYMENT", "PAST_DUE", "SUSPENDED"])
      .order("updated_at", { ascending: false })
      .limit(50),
    admin
      .from("organizations")
      .select("id, name, subscription_status, plan, current_period_ends_at")
      .in("subscription_status", ["ACTIVE", "PAST_DUE"])
      .gte("current_period_ends_at", now.toISOString())
      .lte("current_period_ends_at", in7d.toISOString())
      .order("current_period_ends_at", { ascending: true })
      .limit(50),
    admin
      .from("custom_plans")
      .select("id, org_id, display_name, base_price_ars, discount_percent, discount_ends_at, billing_method, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("billing_events")
      .select("id, org_id, event_type, amount_cents, currency, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("organizations").select("id, name"),
  ])

  const orgNameMap = new Map<string, string>()
  for (const o of (orgsForJoin ?? [])) orgNameMap.set(o.id, o.name)

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-2xl font-semibold text-slate-100">Operaciones de billing</h1>

      <PendingSection rows={pending ?? []} />
      <UpcomingSection rows={upcoming ?? []} />
      <CustomPlansSection rows={customPlans ?? []} orgNameMap={orgNameMap} />
      <EventsSection rows={events ?? []} orgNameMap={orgNameMap} />
    </div>
  )
}

function PendingSection({ rows }: { rows: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Cobranzas pendientes <span className="text-slate-500 text-sm">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">Sin cobranzas pendientes.</p>
        ) : (
          <Table>
            <Thead>
              <Th>Org</Th>
              <Th>Status</Th>
              <Th>Plan</Th>
              <Th>Vence</Th>
              <Th>MP preapproval</Th>
            </Thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                  <Td>
                    <Link href={`/admin/orgs/${r.id}`} className="text-blue-300 hover:underline">
                      {r.name}
                    </Link>
                  </Td>
                  <Td>
                    <span className={cn("rounded px-2 py-0.5 text-xs", statusColor(r.subscription_status))}>
                      {r.subscription_status}
                    </span>
                  </Td>
                  <Td>{r.plan}</Td>
                  <Td className="text-slate-400">
                    {r.current_period_ends_at
                      ? new Date(r.current_period_ends_at).toLocaleDateString("es-AR")
                      : "—"}
                  </Td>
                  <Td className="text-xs text-slate-500 font-mono truncate max-w-[200px]">
                    {r.mp_preapproval_id ?? "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function UpcomingSection({ rows }: { rows: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Próximos vencimientos (7 días) <span className="text-slate-500 text-sm">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">Sin vencimientos próximos.</p>
        ) : (
          <Table>
            <Thead>
              <Th>Org</Th>
              <Th>Status</Th>
              <Th>Plan</Th>
              <Th>Vence en</Th>
            </Thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                  <Td>
                    <Link href={`/admin/orgs/${r.id}`} className="text-blue-300 hover:underline">
                      {r.name}
                    </Link>
                  </Td>
                  <Td>
                    <span className={cn("rounded px-2 py-0.5 text-xs", statusColor(r.subscription_status))}>
                      {r.subscription_status}
                    </span>
                  </Td>
                  <Td>{r.plan}</Td>
                  <Td className="text-slate-400">{relativeTime(r.current_period_ends_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function CustomPlansSection({ rows, orgNameMap }: { rows: any[]; orgNameMap: Map<string, string> }) {
  const now = Date.now()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Custom plans <span className="text-slate-500 text-sm">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">Sin custom plans creados.</p>
        ) : (
          <Table>
            <Thead>
              <Th>Org</Th>
              <Th>Plan</Th>
              <Th>Precio base</Th>
              <Th>Descuento</Th>
              <Th>Método</Th>
              <Th>Creado</Th>
            </Thead>
            <tbody>
              {rows.map((r) => {
                const discountActive = r.discount_ends_at && new Date(r.discount_ends_at).getTime() > now
                return (
                  <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                    <Td>
                      <Link href={`/admin/orgs/${r.org_id}`} className="text-blue-300 hover:underline">
                        {orgNameMap.get(r.org_id) ?? r.org_id}
                      </Link>
                    </Td>
                    <Td>{r.display_name}</Td>
                    <Td>{formatArs(Number(r.base_price_ars))}</Td>
                    <Td>
                      {r.discount_percent > 0 ? (
                        <span className={discountActive ? "text-amber-300" : "text-slate-500"}>
                          {r.discount_percent}% {discountActive ? "vigente" : "expirado"}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{r.billing_method}</span>
                    </Td>
                    <Td className="text-slate-400">{relativeTime(r.created_at)}</Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function EventsSection({ rows, orgNameMap }: { rows: any[]; orgNameMap: Map<string, string> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Eventos recientes <span className="text-slate-500 text-sm">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">Sin eventos.</p>
        ) : (
          <Table>
            <Thead>
              <Th>Cuándo</Th>
              <Th>Tipo</Th>
              <Th>Org</Th>
              <Th>Monto</Th>
              <Th>Status</Th>
            </Thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                  <Td className="text-slate-400">{relativeTime(r.created_at)}</Td>
                  <Td>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-xs font-medium",
                        EVENT_COLORS[r.event_type] ?? "bg-slate-700 text-slate-300"
                      )}
                    >
                      {r.event_type}
                    </span>
                  </Td>
                  <Td>
                    {r.org_id ? (
                      <Link href={`/admin/orgs/${r.org_id}`} className="text-blue-300 hover:underline">
                        {orgNameMap.get(r.org_id) ?? r.org_id}
                      </Link>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </Td>
                  <Td>
                    {r.amount_cents != null ? (
                      formatArs(Number(r.amount_cents) / 100)
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{r.status ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function statusColor(s: string): string {
  if (s === "ACTIVE") return "bg-emerald-500/15 text-emerald-300"
  if (s === "PAST_DUE" || s === "PENDING_PAYMENT") return "bg-amber-500/15 text-amber-300"
  if (s === "SUSPENDED" || s === "CANCELLED") return "bg-red-500/15 text-red-300"
  if (s === "TRIAL" || s === "TRIALING") return "bg-blue-500/15 text-blue-300"
  return "bg-slate-700 text-slate-300"
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded border border-slate-800">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  )
}

function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
      <tr>{children}</tr>
    </thead>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left">{children}</th>
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-top", className)}>{children}</td>
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60_000)
  const future = ms < 0
  const abs = Math.abs(minutes)
  const prefix = future ? "en " : "hace "
  if (abs < 1) return "ahora"
  if (abs < 60) return `${prefix}${abs}m`
  const hours = Math.floor(abs / 60)
  if (hours < 24) return `${prefix}${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${prefix}${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${prefix}${months}mes`
  return `${prefix}${Math.floor(months / 12)}a`
}
