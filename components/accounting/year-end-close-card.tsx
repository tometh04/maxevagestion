"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, Check, Lock, RefreshCw } from "lucide-react"

interface LineaDeCierre {
  codigo: string
  debe: number
  haber: number
  detalle: string
}

interface AsientoDeCierre {
  tipo: "REFUNDICION" | "TRASLADO_RESULTADO"
  currency: string
  lineas: LineaDeCierre[]
  totalDebe: number
  totalHaber: number
}

interface CierreDeEjercicio {
  currency: string
  resultado: number
  asientos: AsientoDeCierre[]
}

interface EjercicioFila {
  ejercicio: number
  desde: string
  hasta: string
  status: "OPEN" | "CLOSED"
  closedAt: string | null
  reopenedAt: string | null
  reopenReason: string | null
  mesesAbiertos: string[]
}

interface Estado {
  configurado: boolean
  fiscalYearEndMonth?: number
  ejercicios: EjercicioFila[]
}

const plata = (n: number, cur: string) =>
  `${cur} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const ETIQUETA: Record<string, string> = {
  REFUNDICION: "Refundición de resultados",
  TRASLADO_RESULTADO: "Traslado a Resultados Acumulados",
}

export function YearEndCloseCard({ agencyId }: { agencyId: string }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState<number | null>(null)
  const [simulacion, setSimulacion] = useState<{ ejercicio: number; cierres: CierreDeEjercicio[] } | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [reabriendo, setReabriendo] = useState<number | null>(null)
  const [motivo, setMotivo] = useState("")

  const cargar = useCallback(async () => {
    if (!agencyId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/accounting/year-end-close?agencyId=${agencyId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo leer el estado de los ejercicios")
      setEstado(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [agencyId])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function accionar(ejercicio: number, action: string, motivoTexto?: string) {
    setTrabajando(ejercicio)
    setError(null)
    setHecho(null)
    try {
      const res = await fetch("/api/accounting/year-end-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, ejercicio, action, motivo: motivoTexto }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo completar")

      if (action === "simular") {
        setSimulacion({ ejercicio, cierres: json.cierres ?? [] })
      } else if (action === "cerrar") {
        setSimulacion(null)
        setHecho(
          `Ejercicio ${ejercicio} cerrado: ${json.asientosCreados} ${
            json.asientosCreados === 1 ? "asiento generado" : "asientos generados"
          }.`
        )
        await cargar()
      } else {
        setHecho(`Ejercicio ${ejercicio} reabierto.`)
        setReabriendo(null)
        setMotivo("")
        await cargar()
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setTrabajando(null)
    }
  }

  if (loading) return <Skeleton className="h-32 w-full" />
  if (!estado || !estado.configurado) return null

  return (
    <section className="space-y-4 rounded-md border px-4 py-4">
      <div className="space-y-1">
        <h3 className="font-medium">Cierre de ejercicio</h3>
        <p className="text-sm text-muted-foreground">
          Cancela las cuentas de resultado del año contra Resultados Acumulados, para que el
          ejercicio siguiente arranque en cero. Exige que los doce meses estén cerrados y no lo
          hace ningún proceso automático.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-3 text-sm">
          <p className="font-medium text-destructive">No se pudo completar</p>
          <p className="mt-0.5 text-muted-foreground">{error}</p>
        </div>
      )}

      {hecho && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3.5 py-2.5 text-sm">
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          {hecho}
        </div>
      )}

      {estado.ejercicios.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no terminó ningún ejercicio. El que está en curso se cierra cuando termine.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-medium">Ejercicio</th>
                <th className="py-2 font-medium">Período</th>
                <th className="py-2 font-medium">Estado</th>
                <th className="py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {estado.ejercicios.map((e) => (
                <tr key={e.ejercicio} className="border-b last:border-0">
                  <td className="py-2.5 font-medium">{e.ejercicio}</td>
                  <td className="py-2.5 text-muted-foreground">
                    {e.desde} al {e.hasta}
                  </td>
                  <td className="py-2.5">
                    {e.status === "CLOSED" ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" aria-hidden />
                        Cerrado
                      </span>
                    ) : e.mesesAbiertos.length > 0 ? (
                      <span
                        className="text-amber-600 dark:text-amber-400"
                        title={e.mesesAbiertos.join(", ")}
                      >
                        {e.mesesAbiertos.length}{" "}
                        {e.mesesAbiertos.length === 1 ? "mes sin cerrar" : "meses sin cerrar"}
                      </span>
                    ) : (
                      <span>Listo para cerrar</span>
                    )}
                    {e.reopenedAt && (
                      <span
                        className="ml-2 text-xs text-muted-foreground"
                        title={e.reopenReason ?? undefined}
                      >
                        (reabierto)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="inline-flex gap-1.5">
                      {e.status === "OPEN" ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={trabajando !== null || e.mesesAbiertos.length > 0}
                            onClick={() => accionar(e.ejercicio, "simular")}
                          >
                            {trabajando === e.ejercicio && (
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            )}
                            Ver detalle
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={trabajando !== null || e.mesesAbiertos.length > 0}
                            onClick={() => accionar(e.ejercicio, "cerrar")}
                          >
                            Cerrar
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={trabajando !== null}
                          onClick={() => {
                            setReabriendo(reabriendo === e.ejercicio ? null : e.ejercicio)
                            setMotivo("")
                          }}
                        >
                          Reabrir
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {estado.ejercicios.map((e) =>
                reabriendo === e.ejercicio ? (
                  <tr key={`${e.ejercicio}-reabrir`} className="border-b bg-muted/40">
                    <td colSpan={4} className="px-1 py-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <label
                          htmlFor={`motivo-ej-${e.ejercicio}`}
                          className="text-sm text-muted-foreground"
                        >
                          Motivo de la reapertura del {e.ejercicio}:
                        </label>
                        <Input
                          id={`motivo-ej-${e.ejercicio}`}
                          value={motivo}
                          onChange={(ev) => setMotivo(ev.target.value)}
                          placeholder="Queda registrado junto con quién lo hizo"
                          className="h-9 w-[320px]"
                        />
                        <Button
                          size="sm"
                          disabled={motivo.trim().length < 3 || trabajando !== null}
                          onClick={() => accionar(e.ejercicio, "reabrir", motivo.trim())}
                        >
                          Confirmar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setReabriendo(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : null
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* El detalle de la simulación: lo que el contador mira antes de cerrar. */}
      {simulacion && (
        <div className="space-y-4 rounded-md border px-3.5 py-3.5">
          <p className="text-sm font-medium">Ejercicio {simulacion.ejercicio}, sin escribir nada</p>

          {simulacion.cierres.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay movimientos de resultado en el ejercicio, así que no hay nada que refundir.
            </p>
          ) : (
            simulacion.cierres.map((c) => (
              <div key={c.currency} className="space-y-2">
                <div className="flex items-baseline justify-between border-b py-1.5">
                  <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    En {c.currency}
                  </span>
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      c.resultado < 0 ? "text-destructive" : ""
                    }`}
                  >
                    Resultado del ejercicio {plata(c.resultado, c.currency)}
                  </span>
                </div>

                {c.asientos.map((a) => (
                  <div key={a.tipo} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {ETIQUETA[a.tipo] ?? a.tipo}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] text-sm">
                        <tbody>
                          {a.lineas.map((l, i) => (
                            <tr key={`${l.codigo}-${i}`} className="border-b last:border-0">
                              <td className="w-[70px] py-1.5 font-mono text-xs text-muted-foreground">
                                {l.codigo}
                              </td>
                              <td className="py-1.5">{l.detalle}</td>
                              <td className="w-[120px] py-1.5 text-right tabular-nums">
                                {l.debe > 0 ? plata(l.debe, "") : ""}
                              </td>
                              <td className="w-[120px] py-1.5 text-right tabular-nums">
                                {l.haber > 0 ? plata(l.haber, "") : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}

          <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <p className="text-muted-foreground">
              Cerrar el ejercicio deja las cuentas de resultado en cero y pasa el resultado al
              patrimonio. El Estado de Resultados de este año va a seguir mostrando lo que pasó; el
              del año siguiente arranca limpio.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
