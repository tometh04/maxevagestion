"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  USAGE_MODULES,
  USAGE_RAMP as RAMP,
  heatLevel,
  formatCount,
  formatLastSeen,
  type UsageByOrgModuleRow,
  type UsageByOrgRow,
  type UsageModuleKey,
} from "@/lib/admin/usage"

type Props = {
  orgs: UsageByOrgRow[]
  /** Escrituras: derivadas de las tablas de dominio. Exactas y retroactivas. */
  matrix: UsageByOrgModuleRow[]
  /** Lecturas: `usage_events`. Solo desde que se deployo la telemetria. */
  reads: UsageByOrgModuleRow[]
  days: number
}

type Hovered = { org: UsageByOrgRow; module: UsageModuleKey; events: number; actors: number } | null

export function UsageHeatmap({ orgs, matrix, reads, days }: Props) {
  // Absoluto responde "quien mueve volumen"; relativo responde "que usa cada
  // agencia" sin que Lozada aplaste a una org de 3 personas. Son dos preguntas
  // distintas y ninguna de las dos sirve sola.
  const [mode, setMode] = useState<"absolute" | "relative">("absolute")
  // Escrituras y lecturas NO se suman: una operacion creada y una pantalla
  // mirada no son la misma unidad. Se miran por separado.
  const [signal, setSignal] = useState<"writes" | "reads">("writes")
  const [hovered, setHovered] = useState<Hovered>(null)

  const active = signal === "writes" ? matrix : reads

  const cells = useMemo(() => {
    const map = new Map<string, { events: number; actors: number }>()
    for (const row of active) {
      map.set(`${row.org_id}:${row.module}`, { events: row.events, actors: row.actors })
    }
    return map
  }, [active])

  const globalMax = useMemo(
    () =>
      active.reduce(
        (max, r) => (USAGE_MODULES.some((m) => m.key === r.module) ? Math.max(max, r.events) : max),
        0
      ),
    [active]
  )

  const rowMax = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of active) {
      if (!USAGE_MODULES.some((m) => m.key === row.module)) continue
      map.set(row.org_id, Math.max(map.get(row.org_id) ?? 0, row.events))
    }
    return map
  }, [active])

  if (orgs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay organizaciones con actividad en los ultimos {days} dias.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
            <ModeButton active={signal === "writes"} onClick={() => setSignal("writes")}>
              Escrituras
            </ModeButton>
            <ModeButton active={signal === "reads"} onClick={() => setSignal("reads")}>
              Lecturas
            </ModeButton>
          </div>
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
            <ModeButton active={mode === "absolute"} onClick={() => setMode("absolute")}>
              Volumen absoluto
            </ModeButton>
            <ModeButton active={mode === "relative"} onClick={() => setMode("relative")}>
              Relativo por agencia
            </ModeButton>
          </div>
        </div>
        <Legend />
      </div>

      {signal === "reads" && reads.length === 0 && (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Todavia no hay lecturas registradas. A diferencia de las escrituras, que
          se derivan de datos que ya existian, este stream empieza a llenarse
          recien desde el deploy de la telemetria.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full border-separate border-spacing-0">
          <caption className="sr-only">
            Eventos por organizacion y modulo en los ultimos {days} dias
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                Organizacion
              </th>
              {USAGE_MODULES.map((m) => (
                <th
                  key={m.key}
                  scope="col"
                  title={m.label}
                  className="px-1 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {m.short}
                </th>
              ))}
              <th
                scope="col"
                className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Ult. act.
              </th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => {
              const max = mode === "relative" ? rowMax.get(org.org_id) ?? 0 : globalMax
              return (
                <tr key={org.org_id} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-[200px] truncate bg-card px-3 py-1 text-left text-xs font-medium text-foreground group-hover:bg-muted/60"
                  >
                    <Link href={`/admin/orgs/${org.org_id}`} className="hover:underline">
                      {org.org_name ?? org.slug ?? org.org_id.slice(0, 8)}
                    </Link>
                  </th>

                  {USAGE_MODULES.map((m) => {
                    const cell = cells.get(`${org.org_id}:${m.key}`)
                    const events = cell?.events ?? 0
                    const level = heatLevel(events, max)
                    const tone = RAMP[level]
                    return (
                      <td key={m.key} className="p-[1px]">
                        <div
                          role="img"
                          aria-label={`${org.org_name ?? "org"} — ${m.label}: ${events} eventos`}
                          onMouseEnter={() =>
                            setHovered({
                              org,
                              module: m.key,
                              events,
                              actors: cell?.actors ?? 0,
                            })
                          }
                          onMouseLeave={() => setHovered(null)}
                          className="flex h-8 min-w-[44px] items-center justify-center rounded text-[11px] tabular-nums transition"
                          style={{ backgroundColor: tone.bg, color: tone.fg }}
                        >
                          {events > 0 ? formatCount(events) : ""}
                        </div>
                      </td>
                    )
                  })}

                  <td className="whitespace-nowrap px-3 py-1 text-right text-[11px] text-muted-foreground">
                    {formatLastSeen(org.last_event_at)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="min-h-[1.25rem] text-xs text-muted-foreground">
        {hovered ? (
          <>
            <span className="font-medium text-foreground">
              {hovered.org.org_name ?? hovered.org.slug}
            </span>{" "}
            — {USAGE_MODULES.find((m) => m.key === hovered.module)?.label}:{" "}
            <span className="tabular-nums">{hovered.events.toLocaleString("es-AR")}</span> eventos
            {hovered.actors > 0 && <> · {hovered.actors} usuario(s)</>}
          </>
        ) : signal === "writes" ? (
          <>
            Escrituras derivadas de las tablas de dominio: exactas y con historia
            retroactiva. Escala logaritmica.
          </>
        ) : (
          <>
            Lecturas del event stream: pantallas abiertas, sin PII. Escala
            logaritmica.
          </>
        )}
      </p>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded px-2.5 py-1 font-medium transition",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span>Menos</span>
      <div className="flex gap-[2px]">
        {RAMP.map((tone, i) => (
          <span
            key={i}
            className="h-3 w-5 rounded-[2px]"
            style={{ backgroundColor: tone.bg }}
            aria-hidden
          />
        ))}
      </div>
      <span>Mas</span>
    </div>
  )
}
