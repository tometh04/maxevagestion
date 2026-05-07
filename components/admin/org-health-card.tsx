import { CheckCircle2, AlertTriangle, AlertCircle, Activity } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { createAdminClient } from "@/lib/supabase/server"
import { getOrgAfipHealth } from "@/lib/afip/check-org-health"

/**
 * Card de diagnóstico server-side para soporte. Vista única que responde
 * "qué le pasa a este tenant" en una pantalla:
 *   - Status de integración AFIP (qué falló, cuántas veces, último código)
 *   - Volumetría última semana (invoices emitidas vs rechazadas, customers
 *     creados, ops nuevas) — para detectar caída repentina de actividad.
 *   - Last login de cualquier user de la org — detecta tenants abandonados
 *     o que dejaron de usar el sistema.
 *
 * Pendientes 2026-05-07 (GTM piloto): cuando un tenant escribe a soporte
 * "no me anda algo", la única forma de investigar era abrir Supabase + correr
 * 4-5 queries SQL distintas. Esta card las concentra en server-side y devuelve
 * una vista accionable.
 *
 * Multi-tenant safe: usa createAdminClient (bypass RLS por diseño — solo se
 * renderiza en /admin que ya tiene gate de platform admin).
 */

interface OrgHealthCardProps {
  orgId: string
}

const SEVERITY_STYLES = {
  ok: {
    icon: CheckCircle2,
    iconClass: "text-success",
    badgeClass: "bg-success/15 text-success border-success/30",
    label: "OK",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-accent-coral",
    badgeClass: "bg-accent-coral/15 text-accent-coral border-accent-coral/30",
    label: "Atención",
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-destructive",
    badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
    label: "Error",
  },
  "not-configured": {
    icon: Activity,
    iconClass: "text-muted-foreground",
    badgeClass: "bg-muted-foreground/15 text-muted-foreground border-border/60",
    label: "Sin configurar",
  },
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—"
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return "—"
  const diffMs = Date.now() - ts
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return "ahora mismo"
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `hace ${diffH}h`
  const diffD = Math.round(diffH / 24)
  if (diffD < 30) return `hace ${diffD}d`
  return new Date(iso).toLocaleDateString("es-AR")
}

export async function OrgHealthCard({ orgId }: OrgHealthCardProps) {
  const admin = createAdminClient() as any
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Lanzar todas las queries en paralelo. La card es server-side,
  // tolera latencia agregada — pero en paralelo cuesta lo que la más lenta.
  const [
    afipHealth,
    invoicesAuthorized,
    invoicesDraftWithError,
    customersCount,
    operationsCount,
    integrationsActive,
    lastUserCreated,
    recentIntegrationErrors,
  ] = await Promise.all([
    getOrgAfipHealth(admin, orgId),
    admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "authorized")
      .gte("created_at", since7d)
      .then((r: any) => r.count ?? 0),
    admin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "draft")
      .gte("created_at", since7d)
      .not("afip_response", "is", null)
      .then((r: any) => r.count ?? 0),
    admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", since7d)
      .then((r: any) => r.count ?? 0),
    admin
      .from("operations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", since7d)
      .then((r: any) => r.count ?? 0),
    (async () => {
      // Agencias de la org → integrations activas
      const { data: ags } = await admin.from("agencies").select("id").eq("org_id", orgId)
      const ids = (ags || []).map((a: any) => a.id)
      if (ids.length === 0) return [] as Array<{ integration_type: string; agency_id: string }>
      const { data } = await admin
        .from("integrations")
        .select("integration_type, agency_id")
        .eq("status", "active")
        .in("agency_id", ids)
      return (data || []) as Array<{ integration_type: string; agency_id: string }>
    })(),
    // public.users no tiene last_sign_in_at (vive en auth.users). Usamos
    // updated_at como proxy de "última actividad del registro user" — lo
    // ideal sería un trigger que linkee auth.users.last_sign_in_at, pero
    // requiere migración. Para day-1 alcanza con esto.
    admin
      .from("users")
      .select("updated_at, name, email")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
      .then((r: any) => r.data),
    (async () => {
      const { data: ags } = await admin.from("agencies").select("id").eq("org_id", orgId)
      const ids = (ags || []).map((a: any) => a.id)
      if (ids.length === 0) return [] as Array<{ message: string; created_at: string; integration_id: string }>
      const { data: integ } = await admin
        .from("integrations")
        .select("id")
        .in("agency_id", ids)
      const integIds = (integ || []).map((i: any) => i.id)
      if (integIds.length === 0) return []
      const { data } = await admin
        .from("integration_logs")
        .select("message, created_at, integration_id")
        .in("integration_id", integIds)
        .eq("log_type", "error")
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(5)
      return (data || []) as Array<{ message: string; created_at: string; integration_id: string }>
    })(),
  ])

  const afipStyle = SEVERITY_STYLES[afipHealth.status]
  const AfipIcon = afipStyle.icon
  const integrationsByType = integrationsActive.reduce((acc: Record<string, number>, i: any) => {
    acc[i.integration_type] = (acc[i.integration_type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Diagnóstico
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Vista rápida del estado del tenant para soporte. Métricas de los últimos 7 días.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* AFIP health */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AfipIcon className={`h-5 w-5 ${afipStyle.iconClass}`} />
              <h3 className="text-sm font-medium text-foreground">AFIP</h3>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${afipStyle.badgeClass}`}>
              {afipStyle.label}
            </span>
          </div>
          {afipHealth.status === "not-configured" && (
            <p className="text-xs text-muted-foreground">
              No hay integración AFIP activa en ninguna agencia. El tenant no puede facturar.
            </p>
          )}
          {(afipHealth.status === "warning" || afipHealth.status === "error") && (
            <div className="text-xs space-y-1">
              <p className="text-foreground">
                {afipHealth.recentFailures} factura{afipHealth.recentFailures === 1 ? "" : "s"} rechazada{afipHealth.recentFailures === 1 ? "" : "s"} en las últimas 24h.
              </p>
              {afipHealth.lastErrorCode && (
                <p className="text-muted-foreground">
                  Último error: AFIP #{afipHealth.lastErrorCode}
                  {afipHealth.lastErrorAt && ` (${formatRelative(afipHealth.lastErrorAt)})`}
                </p>
              )}
              {afipHealth.message && (
                <p className="text-muted-foreground italic">&quot;{afipHealth.message.slice(0, 120)}{afipHealth.message.length > 120 ? "…" : ""}&quot;</p>
              )}
            </div>
          )}
          {afipHealth.status === "ok" && (
            <p className="text-xs text-muted-foreground">
              Sin failures recientes. Integración funcionando normal.
            </p>
          )}
        </div>

        {/* Volumetría 7d + integraciones */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Facturas autorizadas" value={invoicesAuthorized} hint="últ. 7d" />
          <Stat
            label="Facturas rechazadas"
            value={invoicesDraftWithError}
            hint="últ. 7d"
            destructive={invoicesDraftWithError > 0}
          />
          <Stat label="Clientes nuevos" value={customersCount} hint="últ. 7d" />
          <Stat label="Operaciones nuevas" value={operationsCount} hint="últ. 7d" />
        </div>

        {/* Integraciones activas + last login */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-muted-foreground uppercase tracking-wider text-[10px]">Integraciones activas</p>
            {Object.keys(integrationsByType).length === 0 ? (
              <p className="text-foreground">Ninguna</p>
            ) : (
              <p className="text-foreground">
                {Object.entries(integrationsByType)
                  .map(([type, count]) => `${type}${count > 1 ? ` (${count})` : ""}`)
                  .join(" · ")}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-muted-foreground uppercase tracking-wider text-[10px]">
              Última actividad de user
            </p>
            {lastUserCreated?.updated_at ? (
              <p className="text-foreground">
                {formatRelative(lastUserCreated.updated_at)}
                {lastUserCreated.email && (
                  <span className="text-muted-foreground"> · {lastUserCreated.email}</span>
                )}
              </p>
            ) : (
              <p className="text-muted-foreground">Sin registro</p>
            )}
          </div>
        </div>

        {/* Errores recientes de integraciones */}
        {recentIntegrationErrors.length > 0 && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2">
            <p className="text-xs font-medium text-destructive uppercase tracking-wider">
              Errores recientes en integraciones ({recentIntegrationErrors.length})
            </p>
            <ul className="space-y-1.5">
              {recentIntegrationErrors.map((e, i) => (
                <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0">{formatRelative(e.created_at)}</span>
                  <span className="font-mono break-words">
                    {e.message.slice(0, 200)}{e.message.length > 200 ? "…" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  hint,
  destructive,
}: {
  label: string
  value: number
  hint?: string
  destructive?: boolean
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</p>
      <p
        className={`text-2xl font-semibold mt-0.5 ${
          destructive ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
