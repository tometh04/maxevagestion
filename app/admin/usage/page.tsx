import Link from "next/link"
import { Activity, CalendarClock, MousePointerClick, Users } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import { EmptyState } from "@/components/admin/empty-state"
import {
  DataTableShell,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableTh,
  DataTableTd,
} from "@/components/admin/data-table-shell"
import { UsageHeatmap } from "@/components/admin/usage-heatmap"
import { UsageHoursHeatmap } from "@/components/admin/usage-hours-heatmap"
import { UsageDailyChart } from "@/components/admin/usage-daily-chart"
import { cn } from "@/lib/utils"
import {
  INGESTION_MODULE,
  classifyUsage,
  daysSince,
  formatLastSeen,
  type UsageByHourRow,
  type UsageByOrgModuleRow,
  type UsageByOrgRow,
  type UsageDailyRow,
} from "@/lib/admin/usage"

export const dynamic = "force-dynamic"

const RANGES = [7, 30, 90]

/** Orgs que pagan. Que una de estas aparezca dormida es la alarma real de churn. */
const PAYING = new Set(["ACTIVE", "TRIALING", "TRIAL", "PAST_DUE"])

const STATUS_COLOR: Record<string, string> = {
  TRIAL: "bg-primary/15 text-primary border border-primary/30",
  TRIALING: "bg-primary/15 text-primary border border-primary/30",
  ACTIVE: "bg-success/20 text-success border border-success/40 font-medium",
  PAST_DUE: "bg-accent-coral/15 text-accent-coral border border-accent-coral/30",
  PENDING_PAYMENT: "bg-accent-coral/15 text-accent-coral border border-accent-coral/30",
  CANCELLED: "bg-muted-foreground/15 text-muted-foreground border border-border/60",
  SUSPENDED: "bg-destructive/15 text-destructive border border-destructive/30",
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const sp = await searchParams
  const parsed = parseInt(sp.days ?? "30", 10)
  const days = RANGES.includes(parsed) ? parsed : 30

  const admin = createAdminClient() as any

  const [
    { data: orgRows },
    { data: matrixRows },
    { data: readRows },
    { data: hourRows },
    { data: dailyRows },
  ] = await Promise.all([
    admin.rpc("admin_usage_by_org", { p_days: days }),
    admin.rpc("admin_usage_by_org_module", { p_days: days }),
    admin.rpc("admin_usage_reads_by_org_module", { p_days: days }),
    admin.rpc("admin_usage_by_hour", { p_days: days }),
    admin.rpc("admin_usage_daily", { p_days: days }),
  ])

  const orgs: UsageByOrgRow[] = orgRows ?? []
  const matrix: UsageByOrgModuleRow[] = matrixRows ?? []
  const reads: UsageByOrgModuleRow[] = readRows ?? []
  const hours: UsageByHourRow[] = hourRows ?? []
  const daily: UsageDailyRow[] = dailyRows ?? []

  const readsByOrg = new Map<string, number>()
  for (const row of reads) {
    readsByOrg.set(row.org_id, (readsByOrg.get(row.org_id) ?? 0) + row.events)
  }

  const ranked = [...orgs].sort((a, b) => b.user_events - a.user_events)
  // Una org puede tener lecturas y ninguna escritura — es justamente el caso que
  // el heatmap no podia ver antes.
  const withUsage = ranked.filter((o) => o.user_events > 0 || readsByOrg.has(o.org_id))

  const totalEvents = orgs.reduce((sum, o) => sum + o.user_events, 0)
  // `actors` se puede sumar entre orgs: un `users` pertenece a una sola org.
  const totalActors = orgs.reduce((sum, o) => sum + o.actors, 0)
  const activeLast7 = orgs.filter((o) => {
    const d = daysSince(o.last_event_at)
    return d !== null && d <= 7
  }).length
  const payingDormant = orgs.filter(
    (o) =>
      PAYING.has(o.subscription_status ?? "") &&
      classifyUsage(o.last_event_at).key !== "active" &&
      classifyUsage(o.last_event_at).key !== "cooling"
  )

  const ingestionByOrg = new Map<string, number>()
  for (const row of matrix) {
    if (row.module === INGESTION_MODULE) ingestionByOrg.set(row.org_id, row.events)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Uso del producto"
        description="Derivado de las escrituras reales en Postgres, no de GA4: no lo tocan los ad blockers y cruza contra el estado de suscripcion."
        actions={
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/admin/usage?days=${r}`}
                className={cn(
                  "rounded px-2.5 py-1 font-medium transition",
                  r === days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r} d
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Orgs activas (7 d)"
          value={activeLast7}
          icon={Activity}
          hint={`de ${orgs.length} organizaciones`}
        />
        <StatCard
          label="Usuarios que trabajaron"
          value={totalActors}
          icon={Users}
          hint={`en los ultimos ${days} dias`}
        />
        <StatCard
          label="Acciones registradas"
          value={totalEvents.toLocaleString("es-AR")}
          icon={MousePointerClick}
          hint="excluye ingesta automatica de leads"
        />
        <StatCard
          label="Pagan y no usan"
          value={payingDormant.length}
          icon={CalendarClock}
          hint={
            payingDormant.length > 0
              ? payingDormant
                  .slice(0, 2)
                  .map((o) => o.org_name)
                  .join(", ")
              : "ninguna org paga esta dormida"
          }
        />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Mapa de calor por modulo</h2>
          <p className="text-xs text-muted-foreground">
            Las columnas siguen el recorrido del producto: un hueco en el medio marca donde se traba
            la agencia. <strong className="font-medium">Escrituras</strong> son acciones derivadas de
            las tablas; <strong className="font-medium">lecturas</strong> son pantallas abiertas, del
            event stream propio.
          </p>
        </div>
        {withUsage.length === 0 ? (
          <EmptyState
            title="Sin actividad en el periodo"
            description="Ninguna organizacion registro escrituras en la ventana seleccionada."
          />
        ) : (
          <UsageHeatmap orgs={withUsage} matrix={matrix} reads={reads} days={days} />
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Cuando se usa</h2>
            <p className="text-xs text-muted-foreground">
              Dia y hora de Buenos Aires, todas las agencias juntas.
            </p>
          </div>
          <UsageHoursHeatmap rows={hours} days={days} />
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Agencias activas por dia</h2>
            <p className="text-xs text-muted-foreground">
              Cuantas organizaciones distintas escribieron algo cada dia.
            </p>
          </div>
          <UsageDailyChart rows={daily} days={days} />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Engagement por organizacion</h2>
          <p className="text-xs text-muted-foreground">
            &quot;Dias activos&quot; es el numero que mas correlaciona con retencion: una org con
            mucho volumen en un solo dia importo datos y se fue.
          </p>
        </div>
        <DataTableShell>
          <DataTableHead>
            <DataTableRow>
              <DataTableTh>Organizacion</DataTableTh>
              <DataTableTh>Billing</DataTableTh>
              <DataTableTh className="text-right">Acciones</DataTableTh>
              <DataTableTh className="text-right">Usuarios</DataTableTh>
              <DataTableTh className="text-right">
                Dias activos <span className="normal-case">/ {days}</span>
              </DataTableTh>
              <DataTableTh className="text-right">Modulos</DataTableTh>
              <DataTableTh className="text-right">Ingesta</DataTableTh>
              <DataTableTh className="text-right">Ult. actividad</DataTableTh>
              <DataTableTh>Uso</DataTableTh>
            </DataTableRow>
          </DataTableHead>
          <DataTableBody>
            {ranked.map((org) => {
              const health = classifyUsage(org.last_event_at)
              const ingestion = ingestionByOrg.get(org.org_id) ?? 0
              return (
                <DataTableRow key={org.org_id} muted={org.user_events === 0}>
                  <DataTableTd>
                    <Link
                      href={`/admin/orgs/${org.org_id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {org.org_name ?? org.slug ?? org.org_id.slice(0, 8)}
                    </Link>
                  </DataTableTd>
                  <DataTableTd>
                    <span
                      className={cn(
                        "inline-flex rounded px-1.5 py-0.5 text-[10px]",
                        STATUS_COLOR[org.subscription_status ?? ""] ??
                          "bg-muted text-muted-foreground"
                      )}
                    >
                      {org.subscription_status ?? "—"}
                    </span>
                  </DataTableTd>
                  <DataTableTd className="text-right tabular-nums">
                    {org.user_events.toLocaleString("es-AR")}
                  </DataTableTd>
                  <DataTableTd className="text-right tabular-nums">{org.actors || "—"}</DataTableTd>
                  <DataTableTd className="text-right tabular-nums">{org.active_days}</DataTableTd>
                  <DataTableTd className="text-right tabular-nums">{org.modules_used}</DataTableTd>
                  <DataTableTd className="text-right tabular-nums text-muted-foreground">
                    {ingestion > 0 ? ingestion.toLocaleString("es-AR") : "—"}
                  </DataTableTd>
                  <DataTableTd className="text-right whitespace-nowrap">
                    {formatLastSeen(org.last_event_at)}
                  </DataTableTd>
                  <DataTableTd>
                    <span
                      className={cn(
                        "inline-flex rounded px-1.5 py-0.5 text-[10px]",
                        health.className
                      )}
                    >
                      {health.label}
                    </span>
                  </DataTableTd>
                </DataTableRow>
              )
            })}
          </DataTableBody>
        </DataTableShell>
      </section>

      <p className="text-xs text-muted-foreground">
        Que mide: filas creadas por personas usando la app. Quedan afuera los derivados automaticos
        (ledger, comisiones calculadas), los crons y el trafico de integraciones — este ultimo se
        muestra aparte en la columna &quot;Ingesta&quot;. No es una metrica financiera: para plata,
        Postgres directo.
      </p>
    </div>
  )
}
