import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatArs } from "@/lib/billing/plans"
import { cn } from "@/lib/utils"
import { AlertCircle, Clock, Tag, Activity } from "lucide-react"
import { PageHeader } from "@/components/admin/page-header"
import { EmptyState } from "@/components/admin/empty-state"
import {
  DataTableShell,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableTh,
  DataTableTd,
} from "@/components/admin/data-table-shell"

export const dynamic = "force-dynamic"

const EVENT_COLORS: Record<string, string> = {
  PAYMENT_APPROVED: "bg-success/15 text-success",
  SUBSCRIPTION_AUTHORIZED: "bg-success/15 text-success",
  PAYMENT_REJECTED: "bg-destructive/15 text-destructive",
  SUBSCRIPTION_PAUSED: "bg-destructive/15 text-destructive",
  SUBSCRIPTION_CANCELLED: "bg-destructive/15 text-destructive",
  CHECKOUT_INITIATED: "bg-primary/15 text-primary",
  MP_WEBHOOK: "bg-primary/15 text-primary",
  SUBSCRIPTION_CREATED: "bg-primary/15 text-primary",
  MANUAL_ADMIN_ADJUSTMENT: "bg-accent-coral/15 text-accent-coral",
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
      <PageHeader
        title="Operaciones de billing"
        description="Cobranzas pendientes, vencimientos próximos, custom plans vigentes y eventos recientes cross-org."
      />

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
          Cobranzas pendientes <span className="text-muted-foreground text-sm">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="Sin cobranzas pendientes"
            description="Todas las orgs están al día."
          />
        ) : (
          <DataTableShell>
            <DataTableHead>
              <tr>
                <DataTableTh>Org</DataTableTh>
                <DataTableTh>Status</DataTableTh>
                <DataTableTh>Plan</DataTableTh>
                <DataTableTh>Vence</DataTableTh>
                <DataTableTh>MP preapproval</DataTableTh>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {rows.map((r) => (
                <DataTableRow key={r.id}>
                  <DataTableTd>
                    <Link href={`/admin/orgs/${r.id}`} className="text-primary hover:underline">
                      {r.name}
                    </Link>
                  </DataTableTd>
                  <DataTableTd>
                    <span className={cn("rounded px-2 py-0.5 text-xs", statusColor(r.subscription_status))}>
                      {r.subscription_status}
                    </span>
                  </DataTableTd>
                  <DataTableTd>{r.plan}</DataTableTd>
                  <DataTableTd className="text-muted-foreground">
                    {r.current_period_ends_at
                      ? new Date(r.current_period_ends_at).toLocaleDateString("es-AR")
                      : "—"}
                  </DataTableTd>
                  <DataTableTd className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                    {r.mp_preapproval_id ?? "—"}
                  </DataTableTd>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTableShell>
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
          Próximos vencimientos (7 días) <span className="text-muted-foreground text-sm">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Sin vencimientos próximos"
            description="Ninguna org vence en los próximos 7 días."
          />
        ) : (
          <DataTableShell>
            <DataTableHead>
              <tr>
                <DataTableTh>Org</DataTableTh>
                <DataTableTh>Status</DataTableTh>
                <DataTableTh>Plan</DataTableTh>
                <DataTableTh>Vence en</DataTableTh>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {rows.map((r) => (
                <DataTableRow key={r.id}>
                  <DataTableTd>
                    <Link href={`/admin/orgs/${r.id}`} className="text-primary hover:underline">
                      {r.name}
                    </Link>
                  </DataTableTd>
                  <DataTableTd>
                    <span className={cn("rounded px-2 py-0.5 text-xs", statusColor(r.subscription_status))}>
                      {r.subscription_status}
                    </span>
                  </DataTableTd>
                  <DataTableTd>{r.plan}</DataTableTd>
                  <DataTableTd className="text-muted-foreground">{relativeTime(r.current_period_ends_at)}</DataTableTd>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTableShell>
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
          Custom plans <span className="text-muted-foreground text-sm">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Sin custom plans"
            description="Todavía no hay planes custom creados."
          />
        ) : (
          <DataTableShell>
            <DataTableHead>
              <tr>
                <DataTableTh>Org</DataTableTh>
                <DataTableTh>Plan</DataTableTh>
                <DataTableTh>Precio base</DataTableTh>
                <DataTableTh>Descuento</DataTableTh>
                <DataTableTh>Método</DataTableTh>
                <DataTableTh>Creado</DataTableTh>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {rows.map((r) => {
                const discountActive = r.discount_ends_at && new Date(r.discount_ends_at).getTime() > now
                return (
                  <DataTableRow key={r.id}>
                    <DataTableTd>
                      <Link href={`/admin/orgs/${r.org_id}`} className="text-primary hover:underline">
                        {orgNameMap.get(r.org_id) ?? r.org_id}
                      </Link>
                    </DataTableTd>
                    <DataTableTd>{r.display_name}</DataTableTd>
                    <DataTableTd>{formatArs(Number(r.base_price_ars))}</DataTableTd>
                    <DataTableTd>
                      {r.discount_percent > 0 ? (
                        <span className={discountActive ? "text-accent-coral" : "text-muted-foreground"}>
                          {r.discount_percent}% {discountActive ? "vigente" : "expirado"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </DataTableTd>
                    <DataTableTd>
                      <span className="rounded bg-ink px-2 py-0.5 text-xs">{r.billing_method}</span>
                    </DataTableTd>
                    <DataTableTd className="text-muted-foreground">{relativeTime(r.created_at)}</DataTableTd>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTableShell>
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
          Eventos recientes <span className="text-muted-foreground text-sm">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Sin eventos recientes"
            description="Sin eventos billing en el log."
          />
        ) : (
          <DataTableShell>
            <DataTableHead>
              <tr>
                <DataTableTh>Cuándo</DataTableTh>
                <DataTableTh>Tipo</DataTableTh>
                <DataTableTh>Org</DataTableTh>
                <DataTableTh>Monto</DataTableTh>
                <DataTableTh>Status</DataTableTh>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {rows.map((r) => (
                <DataTableRow key={r.id}>
                  <DataTableTd className="text-muted-foreground">{relativeTime(r.created_at)}</DataTableTd>
                  <DataTableTd>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-xs font-medium",
                        EVENT_COLORS[r.event_type] ?? "bg-ink text-muted-foreground"
                      )}
                    >
                      {r.event_type}
                    </span>
                  </DataTableTd>
                  <DataTableTd>
                    {r.org_id ? (
                      <Link href={`/admin/orgs/${r.org_id}`} className="text-primary hover:underline">
                        {orgNameMap.get(r.org_id) ?? r.org_id}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </DataTableTd>
                  <DataTableTd>
                    {r.amount_cents != null ? (
                      formatArs(Number(r.amount_cents) / 100)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </DataTableTd>
                  <DataTableTd className="text-xs text-muted-foreground">{r.status ?? "—"}</DataTableTd>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTableShell>
        )}
      </CardContent>
    </Card>
  )
}

function statusColor(s: string): string {
  if (s === "ACTIVE") return "bg-success/15 text-success"
  if (s === "PAST_DUE" || s === "PENDING_PAYMENT") return "bg-accent-coral/15 text-accent-coral"
  if (s === "SUSPENDED" || s === "CANCELLED") return "bg-destructive/15 text-destructive"
  if (s === "TRIAL" || s === "TRIALING") return "bg-primary/15 text-primary"
  return "bg-ink text-muted-foreground"
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
