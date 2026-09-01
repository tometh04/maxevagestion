import { PRODUCT_MODULES } from "@/lib/analytics/modules"
import {
  USAGE_RAMP,
  barWidth,
  formatLastSeen,
  parseScreen,
  type UsageScreenRow,
} from "@/lib/admin/usage"
import { EmptyState } from "@/components/admin/empty-state"

type Props = {
  rows: UsageScreenRow[]
  days: number
  limit?: number
}

const MODULE_LABELS = new Map(PRODUCT_MODULES.map((m) => [m.key as string, m.label]))

/**
 * Ranking de pantallas. La barra es el encoding principal — la longitud se
 * compara mejor que el color cuando hay muchas filas ordenadas.
 *
 * Muestra la ruta cruda y no un titulo lindo: mantener un mapa de 76 rutas ×
 * 126 tabs a etiquetas se desincroniza en el primer rename, y quien mira esto
 * es platform admin. El modulo, que si tiene etiqueta, va al lado.
 */
export function UsageScreensTable({ rows, days, limit = 25 }: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Sin lecturas registradas"
        description={`Ninguna pantalla se abrio en los ultimos ${days} dias. El ranking se llena desde el deploy de la telemetria de pantalla.`}
      />
    )
  }

  const top = [...rows].sort((a, b) => b.events - a.events).slice(0, limit)
  const max = top[0]?.events ?? 0

  return (
    <div className="space-y-1">
      {top.map((row) => {
        const { path, view, kind } = parseScreen(row.screen)
        return (
          <div
            key={row.screen}
            className="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
          >
            <div className="min-w-0 space-y-1">
              {/* La ruta es el identificador: se lleva el espacio disponible y
                  lo demas se encoge. Sin `flex-1` el truncate se come la ruta
                  antes que las etiquetas, que es al reves de lo que se lee. */}
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                  {path}
                </span>
                {view && (
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                    {kind === "dialog" ? "dialog" : "tab"}: {view}
                  </span>
                )}
                {row.module && (
                  <span className="hidden shrink-0 text-[10px] text-muted-foreground xl:inline">
                    {MODULE_LABELS.get(row.module) ?? row.module}
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: barWidth(row.events, max),
                    backgroundColor: USAGE_RAMP[4].bg,
                  }}
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4 text-right text-xs tabular-nums">
              <span className="w-16 text-foreground">
                {row.events.toLocaleString("es-AR")}
              </span>
              <span className="w-20 text-muted-foreground">
                {row.actors} usuario{row.actors === 1 ? "" : "s"}
              </span>
              <span className="w-20 text-muted-foreground">
                {formatLastSeen(row.last_event_at)}
              </span>
            </div>
          </div>
        )
      })}

      {rows.length > limit && (
        <p className="px-2 pt-2 text-[11px] text-muted-foreground">
          Mostrando las {limit} mas usadas de {rows.length} pantallas distintas.
        </p>
      )}
    </div>
  )
}
