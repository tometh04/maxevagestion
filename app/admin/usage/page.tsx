import Link from "next/link"
import {
  Activity,
  CalendarClock,
  LayoutGrid,
  LogIn,
  MousePointerClick,
  Repeat,
  Timer,
  Users,
} from "lucide-react"
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
import { UsageActivesChart } from "@/components/admin/usage-actives-chart"
import { UsageFilters } from "@/components/admin/usage-filters"
import { UsageScreensTable } from "@/components/admin/usage-screens-table"
import { UsagePeopleTable } from "@/components/admin/usage-people-table"
import { UsageActivationTable } from "@/components/admin/usage-activation-table"
import { USAGE_ROLE_LABELS, isUsageRole } from "@/lib/analytics/roles"
import { cn } from "@/lib/utils"
import {
  INGESTION_MODULE,
  classifyUsage,
  daysSince,
  formatDuration,
  formatLastSeen,
  type UsageActivationRow,
  type UsageActiveUsersRow,
  type UsageByAgencyRow,
  type UsageByHourRow,
  type UsageByOrgModuleRow,
  type UsageByOrgRow,
  type UsageByUserRow,
  type UsageDailyRow,
  type UsageLoginsRow,
  type UsageScreenRow,
  type UsageSessionsRow,
  type UsageStickinessRow,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Search = { days?: string; org?: string; agency?: string; role?: string }

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const sp = await searchParams
  const parsed = parseInt(sp.days ?? "30", 10)
  const days = RANGES.includes(parsed) ? parsed : 30

  // Whitelist en los tres filtros: van directo como parametros de RPC, así que
  // no pueden salir crudos de la query string.
  const orgId = sp.org && UUID_RE.test(sp.org) ? sp.org : null
  const roleFilter = sp.role && isUsageRole(sp.role) ? sp.role : null
  // "none" = sin agencia asignada, que NO es lo mismo que "todas". Antes ambas
  // se expresaban con `null` y por eso "Sin agencia" era un filtro fantasma:
  // mostraba exactamente lo mismo que sin filtrar, con el select diciendo que
  // había algo aplicado.
  const agencyParam =
    sp.agency === "none" ? "none" : sp.agency && UUID_RE.test(sp.agency) ? sp.agency : null
  const agencyId = agencyParam && agencyParam !== "none" ? agencyParam : null
  const agencyUnassigned = agencyParam === "none"

  const admin = createAdminClient() as any

  // El mismo alcance para todas las RPC. Que un solo bloque quede sin filtrar es
  // peor que no tener filtro: la pantalla mezcla denominadores sin avisar.
  const scope = {
    p_days: days,
    p_org_id: orgId,
    p_agency_id: agencyId,
    p_agency_unassigned: agencyUnassigned,
    p_role: roleFilter,
  }

  const [
    { data: orgRows },
    { data: matrixRows },
    { data: readRows },
    { data: hourRows },
    { data: dailyRows },
    { data: screenRows },
    { data: activesRows },
    { data: sessionRows },
    { data: loginRows },
    { data: activationRows },
    { data: agencyRows },
    { data: stickyRows },
    { data: orgListRows },
    { data: agencyListRows },
  ] = await Promise.all([
    admin.rpc("admin_usage_by_org", scope),
    admin.rpc("admin_usage_by_org_module", scope),
    admin.rpc("admin_usage_reads_by_org_module", scope),
    admin.rpc("admin_usage_by_hour", scope),
    admin.rpc("admin_usage_daily", scope),
    admin.rpc("admin_usage_screens", scope),
    admin.rpc("admin_usage_active_users", scope),
    admin.rpc("admin_usage_sessions", scope),
    // Sin agencia: `login_sessions` no tiene esa columna. La sesión de auth es
    // de la persona, no de la sucursal.
    admin.rpc("admin_usage_logins_daily", {
      p_days: days,
      p_org_id: orgId,
      p_role: roleFilter,
    }),
    admin.rpc("admin_usage_activation", { p_org_id: orgId }),
    admin.rpc("admin_usage_by_agency", scope),
    admin.rpc("admin_usage_stickiness_by_org", scope),
    admin.from("organizations").select("id, name").order("name"),
    // Del catálogo, no de la actividad: una agencia sin eventos en la ventana
    // igual tiene que poder elegirse, y la lista no puede cambiar al mover el
    // rango de días.
    orgId
      ? admin.from("agencies").select("id, name").eq("org_id", orgId).order("name")
      : Promise.resolve({ data: [] }),
  ])

  const orgs: UsageByOrgRow[] = orgRows ?? []
  const matrix: UsageByOrgModuleRow[] = matrixRows ?? []
  const reads: UsageByOrgModuleRow[] = readRows ?? []
  const hours: UsageByHourRow[] = hourRows ?? []
  const daily: UsageDailyRow[] = dailyRows ?? []
  const screens: UsageScreenRow[] = screenRows ?? []
  const actives: UsageActiveUsersRow[] = activesRows ?? []
  const sessions: UsageSessionsRow[] = sessionRows ?? []
  const logins: UsageLoginsRow[] = loginRows ?? []
  const activation: UsageActivationRow[] = activationRows ?? []
  const agencyUsage: UsageByAgencyRow[] = agencyRows ?? []
  const sticky: UsageStickinessRow[] = stickyRows ?? []
  const orgOptions = (orgListRows ?? []) as { id: string; name: string }[]
  const agencyOptions = (agencyListRows ?? []) as { id: string; name: string }[]

  const selectedOrg = orgId ? orgs.find((o) => o.org_id === orgId) ?? null : null
  const selectedAgencyName = agencyUnassigned
    ? "Sin agencia"
    : agencyOptions.find((a) => a.id === agencyId)?.name ?? null

  // El drill-down por persona es la unica consulta con PII, asi que solo se
  // ejecuta cuando hay una org elegida (la RPC ademas exige el parametro).
  let people: UsageByUserRow[] = []
  if (orgId) {
    const { data } = await admin.rpc("admin_usage_by_user", {
      p_org_id: orgId,
      p_days: days,
      p_agency_id: agencyId,
      p_agency_unassigned: agencyUnassigned,
      p_role: roleFilter,
    })
    people = data ?? []
  }

  // La RPC ahora devuelve UNA fila ya agregada al alcance elegido. Antes venia
  // una por org y la pagina las "sumaba" con un reduce que arrastraba la mediana
  // de una org arbitraria: medio numero filtrado y medio no.
  const sessionStats: UsageSessionsRow | null = sessions[0] ?? null

  const loginsInRange = logins.reduce((sum, l) => sum + l.logins, 0)
  // La RPC ahora ordena por dia; antes esto tomaba una fila cualquiera.
  const lastActives = actives.length > 0 ? actives[actives.length - 1] : null

  // Con una org elegida se usa el promedio de la ventana (`stickiness_by_org`) y
  // no el DAU/MAU del ultimo dia: en una agencia de 7 personas, que hoy hayan
  // entrado 2 o 5 mueve el numero 40 puntos y no dice nada.
  const orgSticky = orgId ? sticky.find((s) => s.org_id === orgId) ?? null : null
  const stickiness =
    orgSticky?.stickiness != null
      ? Math.round(Number(orgSticky.stickiness) * 100)
      : lastActives && lastActives.mau > 0
        ? Math.round((lastActives.dau / lastActives.mau) * 100)
        : null

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
                // Preserva los filtros: cambiar el rango no puede resetear la
                // org que venías mirando.
                href={buildHref({ days: r, org: orgId, agency: agencyParam, role: roleFilter })}
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

      <UsageFilters orgs={orgOptions} agencies={agencyOptions} />

      {/* Barra de alcance. Es lo que evita el problema de fondo: cuatro cards
          contiguas con denominadores distintos y nada que lo diga. Si TODO
          obedece al filtro y el filtro está escrito, no hay ambigüedad. */}
      {(selectedOrg || selectedAgencyName || roleFilter) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Mostrando
          </span>
          {selectedOrg && (
            <span className="font-medium text-foreground">{selectedOrg.org_name}</span>
          )}
          {selectedOrg && (
            <span className="text-xs text-muted-foreground">
              ({selectedOrg.subscription_status})
            </span>
          )}
          {selectedAgencyName && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">agencia {selectedAgencyName}</span>
            </>
          )}
          {roleFilter && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">rol {USAGE_ROLE_LABELS[roleFilter]}</span>
            </>
          )}
          {selectedOrg && (
            <Link
              href={`/admin/orgs/${selectedOrg.org_id}`}
              className="ml-auto text-xs text-primary hover:underline"
            >
              Ver ficha de billing
            </Link>
          )}
          <Link
            href={buildHref({ days, org: null, agency: null, role: null })}
            className={cn(
              "text-xs text-muted-foreground hover:text-foreground",
              !selectedOrg && "ml-auto"
            )}
          >
            Quitar filtros
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Con una org elegida, "orgs activas" no significa nada: lo que
            interesa es cuánta de SU gente está trabajando. */}
        {selectedOrg ? (
          <StatCard
            label="Personas activas (7 d)"
            value={lastActives?.wau ?? 0}
            icon={Activity}
            hint={`de ${people.length} usuarios de la agencia`}
          />
        ) : (
          <StatCard
            label="Orgs activas (7 d)"
            value={activeLast7}
            icon={Activity}
            hint={`de ${orgs.length} organizaciones`}
          />
        )}
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
        {selectedOrg ? (
          <StatCard
            label="Estado de uso"
            value={classifyUsage(selectedOrg.last_event_at).label}
            icon={CalendarClock}
            hint={`${formatLastSeen(selectedOrg.last_event_at)} · ${selectedOrg.active_days} días con actividad`}
          />
        ) : (
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
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Logins"
          value={loginsInRange.toLocaleString("es-AR")}
          icon={LogIn}
          hint={`en los ultimos ${days} dias`}
        />
        <StatCard
          label="Sesiones de trabajo"
          value={(sessionStats?.sessions ?? 0).toLocaleString("es-AR")}
          icon={Timer}
          hint={
            sessionStats?.median_duration_sec
              ? `mediana ${formatDuration(sessionStats.median_duration_sec)}`
              : "sin datos todavia"
          }
        />
        <StatCard
          label="Stickiness (DAU/MAU)"
          value={stickiness === null ? "—" : `${stickiness}%`}
          icon={Repeat}
          hint={
            orgSticky
              ? `${orgSticky.dau_avg} de ${orgSticky.mau} usuarios, promedio del periodo`
              : lastActives
                ? `${lastActives.dau} de ${lastActives.mau} usuarios del mes`
                : "sin datos"
          }
        />
        <StatCard
          label="Pantallas distintas"
          value={screens.length}
          icon={LayoutGrid}
          hint={screens.length === 0 ? "esperando telemetria de pantalla" : "con al menos una visita"}
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
            <h2 className="text-sm font-semibold text-foreground">
              {selectedOrg ? "Personas activas por día" : "Agencias activas por día"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {selectedOrg
                ? "Cuánta gente de esta organización trabajó cada día."
                : "Cuántas organizaciones distintas escribieron algo cada día."}
            </p>
          </div>
          {/* Con una org fija, contar orgs distintas sería una línea plana en 1. */}
          <UsageDailyChart rows={daily} days={days} metric={selectedOrg ? "users" : "orgs"} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Usuarios activos</h2>
            <p className="text-xs text-muted-foreground">
              Diarios, semanales y mensuales. La distancia entre las tres líneas es el
              hábito: si la diaria se acerca a la mensual, la gente abre la app todos los
              días.
            </p>
          </div>
          <UsageActivesChart rows={actives} days={days} />
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Pantallas más usadas</h2>
            <p className="text-xs text-muted-foreground">
              Incluye tabs y diálogos, que no tienen URL propia. Un módulo puede tener
              mucha actividad y una sola de sus pantallas ser la que la genera.
            </p>
          </div>
          <UsageScreensTable rows={screens} days={days} limit={12} />
        </div>
      </section>

      {orgId && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Personas</h2>
            <p className="text-xs text-muted-foreground">
              Quién usa el producto dentro de esta organización. Las escrituras salen de
              las tablas de dominio; las lecturas, del event stream.
            </p>
          </div>
          <UsagePeopleTable rows={people} days={days} />
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Actividad por agencia
          </h2>
          <p className="text-xs text-muted-foreground">
            En las escrituras la agencia es la del registro, no la de quien lo cargó.
            Contabilidad, comisiones y pagos a operadores se manejan a nivel organización,
            así que caen en &quot;Sin agencia&quot; — no es un error.
          </p>
        </div>
        {agencyUsage.length === 0 ? (
          <EmptyState title="Sin actividad por agencia en el periodo" />
        ) : (
          <DataTableShell>
            <DataTableHead>
              <DataTableRow>
                <DataTableTh>Agencia</DataTableTh>
                <DataTableTh className="text-right">Usuarios</DataTableTh>
                <DataTableTh className="text-right">Escrituras</DataTableTh>
                <DataTableTh className="text-right">Lecturas</DataTableTh>
                <DataTableTh className="text-right">
                  Días activos <span className="normal-case">/ {days}</span>
                </DataTableTh>
                <DataTableTh className="text-right">Últ. actividad</DataTableTh>
              </DataTableRow>
            </DataTableHead>
            <DataTableBody>
              {[...agencyUsage]
                .sort((a, b) => b.writes + b.reads - (a.writes + a.reads))
                .map((row) => (
                  <DataTableRow key={`${row.org_id}:${row.agency_id ?? "none"}`}>
                    <DataTableTd>
                      <div className="font-medium text-foreground">{row.agency_name}</div>
                      {!orgId && (
                        <div className="text-xs text-muted-foreground">
                          {orgs.find((o) => o.org_id === row.org_id)?.org_name ?? ""}
                        </div>
                      )}
                    </DataTableTd>
                    <DataTableTd className="text-right tabular-nums">{row.users}</DataTableTd>
                    <DataTableTd className="text-right tabular-nums">
                      {row.writes.toLocaleString("es-AR")}
                    </DataTableTd>
                    <DataTableTd className="text-right tabular-nums">
                      {row.reads.toLocaleString("es-AR")}
                    </DataTableTd>
                    <DataTableTd className="text-right tabular-nums">
                      {row.active_days}
                    </DataTableTd>
                    <DataTableTd className="whitespace-nowrap text-right text-xs text-muted-foreground">
                      {formatLastSeen(row.last_event_at)}
                    </DataTableTd>
                  </DataTableRow>
                ))}
            </DataTableBody>
          </DataTableShell>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Activación</h2>
          <p className="text-xs text-muted-foreground">
            Cuánto tarda una agencia nueva desde que se da de alta hasta que carga su
            primera operación y cobra su primer pago.
          </p>
        </div>
        <UsageActivationTable rows={activation} />
      </section>

      {/* Con una org elegida esta tabla es la lista de la que venís: una fila
          sola, o peor, todas las demás organizaciones al lado de números que ya
          son de una. */}
      <section className={cn("space-y-3", selectedOrg && "hidden")}>
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
        Que mide: filas creadas por personas usando la app, mas las pantallas que se abren.
        Quedan afuera los derivados automaticos (ledger, comisiones calculadas), los crons y el
        trafico de integraciones — este ultimo se muestra aparte en la columna &quot;Ingesta&quot;.
        La duracion de sesion es una cota inferior: quien deja una pantalla abierta sin tocar nada
        no suma tiempo. No es una metrica financiera: para plata, Postgres directo.
      </p>
    </div>
  )
}

/** Arma un href preservando los filtros que no se están cambiando. */
function buildHref(params: {
  days: number
  org: string | null
  agency: string | null
  role: string | null
}): string {
  const query = new URLSearchParams()
  if (params.days !== 30) query.set("days", String(params.days))
  if (params.org) query.set("org", params.org)
  if (params.agency) query.set("agency", params.agency)
  if (params.role) query.set("role", params.role)
  const qs = query.toString()
  return qs ? `/admin/usage?${qs}` : "/admin/usage"
}
