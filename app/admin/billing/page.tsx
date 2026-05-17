import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatArs } from "@/lib/billing/plans"
import { cn } from "@/lib/utils"
import { AlertCircle, Clock, Tag, Activity } from "lucide-react"
import { PageHeader } from "@/components/admin/page-header"
import { MpSandboxBanner } from "@/components/admin/mp-sandbox-banner"
import { EmptyState } from "@/components/admin/empty-state"
import { EnterpriseWithoutPriceAlert } from "@/components/admin/enterprise-without-price-alert"
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
  const nowIso = now.toISOString()
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const in7dIso = in7d.toISOString()

  // Pendientes 2026-05-16 — los filtros originales perdían dos casos comunes:
  //   1. TRIALING con trial_ends_at PASADO (trial expirado sin convertir)
  //      → se queda en limbo TRIALING para siempre, hay que accionar.
  //   2. TRIALING con trial_ends_at en próximos 7 días → debería estar en
  //      "próximos vencimientos" para hacer outreach antes de que expire.
  // Por eso hacemos queries separadas y mergeamos en memoria.

  const [
    { data: pendingExplicit },
    { data: pendingTrialExpired },
    { data: upcomingPaid },
    { data: upcomingTrials },
    { data: customPlans },
    { data: events },
    { data: orgsForJoin },
  ] = await Promise.all([
    // Cobranzas pendientes — orgs con status explícito de pago pendiente
    admin
      .from("organizations")
      .select("id, name, subscription_status, plan, current_period_ends_at, trial_ends_at, mp_preapproval_id, updated_at")
      .in("subscription_status", ["PENDING_PAYMENT", "PAST_DUE", "SUSPENDED"])
      .order("updated_at", { ascending: false })
      .limit(50),
    // Cobranzas pendientes — trials EXPIRADOS sin convertir (acción manual)
    admin
      .from("organizations")
      .select("id, name, subscription_status, plan, current_period_ends_at, trial_ends_at, mp_preapproval_id, updated_at")
      .eq("subscription_status", "TRIALING")
      .lt("trial_ends_at", nowIso)
      .order("trial_ends_at", { ascending: true })
      .limit(50),
    // Próximos vencimientos — orgs pagas con period en próximos 7 días
    admin
      .from("organizations")
      .select("id, name, subscription_status, plan, current_period_ends_at, trial_ends_at")
      .in("subscription_status", ["ACTIVE", "PAST_DUE"])
      .gte("current_period_ends_at", nowIso)
      .lte("current_period_ends_at", in7dIso)
      .order("current_period_ends_at", { ascending: true })
      .limit(50),
    // Próximos vencimientos — trials que vencen en próximos 7 días
    admin
      .from("organizations")
      .select("id, name, subscription_status, plan, current_period_ends_at, trial_ends_at")
      .eq("subscription_status", "TRIALING")
      .gte("trial_ends_at", nowIso)
      .lte("trial_ends_at", in7dIso)
      .order("trial_ends_at", { ascending: true })
      .limit(50),
    admin
      .from("custom_plans")
      .select("id, org_id, display_name, base_price_ars, discount_percent, discount_ends_at, billing_method, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    // Filtramos org_id IS NOT NULL: rows huérfanos = tenants borrados
    // (FK SET NULL al delete de org) + checkouts pre-org de testeo. Son ruido
    // en la vista operativa. Para forense quedan en la BD vía Supabase SQL.
    admin
      .from("billing_events")
      .select("id, org_id, event_type, amount_cents, currency, status, created_at")
      .not("org_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("organizations").select("id, name"),
  ])

  // Merge pending: explicit + trial_expired, dedup por id
  const pendingMap = new Map<string, any>()
  for (const r of (pendingExplicit ?? [])) pendingMap.set(r.id, r)
  for (const r of (pendingTrialExpired ?? [])) {
    if (!pendingMap.has(r.id)) pendingMap.set(r.id, r)
  }
  const pending = Array.from(pendingMap.values())

  // Merge upcoming: paid + trials, ordenar por la fecha relevante
  const upcomingItems = [
    ...(upcomingPaid ?? []).map((r: any) => ({ ...r, _expiresAt: r.current_period_ends_at })),
    ...(upcomingTrials ?? []).map((r: any) => ({ ...r, _expiresAt: r.trial_ends_at })),
  ].sort((a, b) => (a._expiresAt ?? "").localeCompare(b._expiresAt ?? ""))
  const upcoming = upcomingItems

  const orgNameMap = new Map<string, string>()
  for (const o of (orgsForJoin ?? [])) orgNameMap.set(o.id, o.name)

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Operaciones de billing"
        description="Cobranzas pendientes, vencimientos próximos, custom plans vigentes y eventos recientes cross-org."
      />

      <MpSandboxBanner />

      {/* Alerta: orgs ENTERPRISE sin custom_plan ni MRR override.
          Se invisibilizan al MRR/ARR y no aparecen en cobranzas/vencimientos
          (sin precio configurado). Acción directa: link al detail de cada una. */}
      <EnterpriseWithoutPriceAlert />

      <PendingSection rows={pending ?? []} />
      <UpcomingSection rows={upcoming ?? []} />
      <CustomPlansSection rows={customPlans ?? []} orgNameMap={orgNameMap} />
      <EventsSection rows={events ?? []} orgNameMap={orgNameMap} />
    </div>
  )
}

function PendingSection({ rows }: { rows: any[] }) {
  const nowMs = Date.now()
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
                <DataTableTh>Vence/Vencido</DataTableTh>
                <DataTableTh>MP preapproval</DataTableTh>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {rows.map((r) => {
                // Para TRIALING expirado mostramos trial_ends_at; para el resto, period.
                const refDate =
                  r.subscription_status === "TRIALING"
                    ? r.trial_ends_at
                    : r.current_period_ends_at
                const isExpired = refDate && new Date(refDate).getTime() < nowMs
                return (
                  <DataTableRow key={r.id}>
                    <DataTableTd>
                      <Link href={`/admin/orgs/${r.id}`} className="text-primary hover:underline">
                        {r.name}
                      </Link>
                    </DataTableTd>
                    <DataTableTd>
                      <span className={cn("rounded px-2 py-0.5 text-xs", statusColor(r.subscription_status))}>
                        {r.subscription_status}
                        {r.subscription_status === "TRIALING" && isExpired ? " (expirado)" : ""}
                      </span>
                    </DataTableTd>
                    <DataTableTd>{r.plan}</DataTableTd>
                    <DataTableTd className={isExpired ? "text-destructive" : "text-muted-foreground"}>
                      {refDate ? relativeTime(refDate) : "—"}
                    </DataTableTd>
                    <DataTableTd className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                      {r.mp_preapproval_id ?? "—"}
                    </DataTableTd>
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
              {rows.map((r) => {
                // _expiresAt = trial_ends_at para TRIALING, current_period_ends_at para el resto.
                const refDate = r._expiresAt ?? r.current_period_ends_at
                return (
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
                    <DataTableTd className="text-muted-foreground">{relativeTime(refDate)}</DataTableTd>
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
                      <span className="rounded bg-muted px-2 py-0.5 text-xs">{r.billing_method}</span>
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
                        EVENT_COLORS[r.event_type] ?? "bg-muted text-muted-foreground"
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
  return "bg-muted text-muted-foreground"
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
