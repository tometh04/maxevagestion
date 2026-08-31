"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertTriangle, CalendarClock, Lock, Unlock, RefreshCw } from "lucide-react"
import { OpeningEntryCard } from "./opening-entry-card"
import { YearEndCloseCard } from "./year-end-close-card"

interface Periodo {
  period: string
  status: "OPEN" | "CLOSED"
  last_run_at: string | null
  closed_at: string | null
  reopened_at: string | null
  reopen_reason: string | null
}

interface Anomalia {
  operationId: string
  numero: string
  motivo: string
  venta: number
  cobrado: number
  currency: string
}

interface Estado {
  configurado: boolean
  accountingStartDate: string | null
  monthlyCloseDay: number
  autoCloseMonth: boolean
  periodos: Periodo[]
  pendientes: string[]
}

interface Resultado {
  periodo: string
  omitido?: string
  asientosCreados: number
  asientosBorrados: number
  anomalias: Anomalia[]
  resumen?: Record<string, { cantidad: number; porMoneda: Record<string, number> }>
  revaluacion?: {
    omitido?: string
    cuentasRevaluadas: number
    ganancia: number
    perdida: number
    monedaFuncional?: string
  }
}

interface Props {
  agencies: Array<{ id: string; name: string }>
}

const ETIQUETA: Record<string, string> = {
  ANTICIPO_CLIENTE: "Anticipos de clientes",
  ANTICIPO_PROVEEDOR: "Anticipos a operadores",
  VENTA_SIN_FACTURAR: "Ventas sin facturar",
  FACTURA_A_RECIBIR: "Facturas a recibir",
}

function mesLargo(periodo: string) {
  const [y, m] = periodo.split("-")
  const nombre = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}

const plata = (n: number, cur: string) =>
  `${cur} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function MonthlyClosePageClient({ agencies }: Props) {
  const [agencyId, setAgencyId] = useState(agencies[0]?.id ?? "")
  const [estado, setEstado] = useState<Estado | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  // La reapertura pide motivo en una fila que se despliega, no en un modal ni
  // en un prompt del navegador: es una acción rara pero no dramática.
  const [reabriendo, setReabriendo] = useState<string | null>(null)
  const [motivo, setMotivo] = useState("")

  const cargar = useCallback(async () => {
    if (!agencyId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/accounting/close?agencyId=${agencyId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo leer el estado del cierre")
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

  async function accionar(period: string, action: string, motivo?: string) {
    setTrabajando(`${period}:${action}`)
    setError(null)
    try {
      const res = await fetch("/api/accounting/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, period, action, motivo }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo completar la acción")
      if (action === "calcular" || action === "simular") setResultado(json)
      await cargar()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setTrabajando(null)
    }
  }

  async function confirmarReapertura() {
    if (!reabriendo || motivo.trim().length < 3) return
    await accionar(reabriendo, "reabrir", motivo.trim())
    setReabriendo(null)
    setMotivo("")
  }

  return (
    <div className="space-y-5">
      {agencies.length > 1 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Agencia</label>
          <Select value={agencyId} onValueChange={setAgencyId}>
            <SelectTrigger className="h-9 w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {agencies.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-3 text-sm">
          <p className="font-medium text-destructive">No se pudo completar</p>
          <p className="mt-0.5 text-muted-foreground">{error}</p>
        </div>
      )}

      {/* Sin fecha de inicio no hay contabilidad que cerrar. Se manda a
          configurarla en vez de mostrar una tabla vacía que parezca una falla. */}
      {!loading && estado && !estado.configurado && (
        <div className="flex flex-wrap items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3.5">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">Falta definir desde cuándo se lleva contabilidad</p>
            <p className="text-sm text-muted-foreground">
              El cierre mensual genera los ajustes de cada mes —anticipos de clientes, anticipos a
              operadores— mirando cómo quedó el negocio al último día. Sin una fecha de inicio
              alcanzaría también a las operaciones viejas, cuyos importes no siempre son
              confiables.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/finances/settings">Configurar</Link>
          </Button>
        </div>
      )}

      {!loading && estado?.configurado && (
        <>
          {/* Va primero porque es el punto de partida: sin apertura, los
              cierres mensuales que vengan después arrancan de un balance
              incompleto. */}
          <OpeningEntryCard agencyId={agencyId} />

          <p className="text-sm text-muted-foreground">
            Contabilidad desde el {estado.accountingStartDate}. Cierre{" "}
            {estado.autoCloseMonth ? (
              <>
                automático el día {estado.monthlyCloseDay} de cada mes
              </>
            ) : (
              <>manual (el automático está desactivado)</>
            )}
            .
          </p>

          {estado.pendientes.length > 0 && (
            <div className="rounded-md border bg-muted/40 px-4 py-3.5">
              <p className="text-sm font-medium">
                {estado.pendientes.length === 1
                  ? "Hay un período sin cerrar"
                  : `Hay ${estado.pendientes.length} períodos sin cerrar`}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {estado.pendientes.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant="outline"
                    disabled={trabajando !== null}
                    onClick={() => accionar(p, "calcular")}
                  >
                    {trabajando === `${p}:calcular` && (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    )}
                    Calcular {mesLargo(p)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {resultado && (
            <div className="space-y-3 rounded-md border px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">{mesLargo(resultado.periodo)}</p>
                <p className="text-sm text-muted-foreground">
                  {resultado.omitido
                    ? resultado.omitido
                    : `${resultado.asientosCreados} ${
                        resultado.asientosCreados === 1 ? "asiento generado" : "asientos generados"
                      }${
                        resultado.asientosBorrados > 0
                          ? `, reemplazando ${resultado.asientosBorrados} del cálculo anterior`
                          : ""
                      }.`}
                </p>
              </div>

              {resultado.resumen && (
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(resultado.resumen)
                      .filter(([, r]) => r.cantidad > 0)
                      .map(([tipo, r]) => (
                        <tr key={tipo} className="border-b last:border-0">
                          <td className="py-1.5">{ETIQUETA[tipo] ?? tipo}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                            {r.cantidad}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {Object.entries(r.porMoneda)
                              .map(([cur, monto]) => plata(monto, cur))
                              .join("  ·  ")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}

              {resultado.revaluacion && (
                <div className="rounded-md border bg-muted/40 px-3.5 py-3 text-sm">
                  <p className="font-medium">Revaluación de saldos en otra moneda</p>
                  {resultado.revaluacion.omitido ? (
                    <p className="mt-0.5 text-muted-foreground">
                      No se hizo: {resultado.revaluacion.omitido} Se prefiere no hacerla antes que
                      valuar con una cotización que no corresponde.
                    </p>
                  ) : resultado.revaluacion.cuentasRevaluadas === 0 ? (
                    <p className="mt-0.5 text-muted-foreground">
                      No hay saldos en otra moneda que revaluar.
                    </p>
                  ) : (
                    <p className="mt-0.5 text-muted-foreground">
                      {resultado.revaluacion.cuentasRevaluadas}{" "}
                      {resultado.revaluacion.cuentasRevaluadas === 1 ? "cuenta" : "cuentas"}.
                      Ganancia {plata(resultado.revaluacion.ganancia, resultado.revaluacion.monedaFuncional ?? "")}
                      {" · "}
                      Pérdida {plata(resultado.revaluacion.perdida, resultado.revaluacion.monedaFuncional ?? "")}.
                      No cambia la plata que hay en las cuentas, solo su valor en la moneda de los
                      libros.
                    </p>
                  )}
                </div>
              )}

              {resultado.anomalias.length > 0 && (
                <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
                  <div className="flex gap-2.5">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                      aria-hidden
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {resultado.anomalias.length === 1
                          ? "Una operación quedó sin ajustar"
                          : `${resultado.anomalias.length} operaciones quedaron sin ajustar`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Los cobros superan la venta por tanto que casi seguro el importe de venta
                        está mal cargado. Se informan en vez de asentarlos, porque hacerlo crearía
                        una deuda con el cliente que la agencia no tiene.
                      </p>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {resultado.anomalias.map((a) => (
                        <tr key={a.operationId} className="border-b last:border-0">
                          <td className="py-1.5 font-mono text-xs">{a.numero}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                            venta {plata(a.venta, a.currency)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            cobrado {plata(a.cobrado, a.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {estado.periodos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no se calculó ningún período.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 font-medium">Período</th>
                  <th className="py-2 font-medium">Estado</th>
                  <th className="py-2 font-medium">Último cálculo</th>
                  <th className="py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {estado.periodos.map((p) => (
                  <tr key={p.period} className="border-b last:border-0">
                    <td className="py-2.5">{mesLargo(p.period)}</td>
                    <td className="py-2.5">
                      {p.status === "CLOSED" ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" aria-hidden />
                          Cerrado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <Unlock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                          Abierto
                        </span>
                      )}
                      {p.reopened_at && (
                        <span
                          className="ml-2 text-xs text-muted-foreground"
                          title={p.reopen_reason ?? undefined}
                        >
                          (reabierto)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {p.last_run_at
                        ? new Date(p.last_run_at).toLocaleString("es-AR", { dateStyle: "short" })
                        : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex gap-1.5">
                        {p.status === "OPEN" ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={trabajando !== null}
                              onClick={() => accionar(p.period, "calcular")}
                            >
                              Recalcular
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={trabajando !== null}
                              onClick={() => accionar(p.period, "cerrar")}
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
                              setReabriendo(reabriendo === p.period ? null : p.period)
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
                {estado.periodos.map((p) =>
                  reabriendo === p.period ? (
                    <tr key={`${p.period}-reabrir`} className="border-b bg-muted/40">
                      <td colSpan={4} className="px-1 py-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <label
                            htmlFor={`motivo-${p.period}`}
                            className="text-sm text-muted-foreground"
                          >
                            Motivo de la reapertura de {mesLargo(p.period)}:
                          </label>
                          <Input
                            id={`motivo-${p.period}`}
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            placeholder="Queda registrado junto con quién lo hizo"
                            className="h-9 w-[320px]"
                          />
                          <Button
                            size="sm"
                            disabled={motivo.trim().length < 3 || trabajando !== null}
                            onClick={confirmarReapertura}
                          >
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReabriendo(null)
                              setMotivo("")
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          )}
          <YearEndCloseCard agencyId={agencyId} />


          <p className="text-sm text-muted-foreground">
            Cerrar un período deja sus ajustes firmes. No impide registrar cobros ni pagos con
            fecha anterior: frenar una cobranza real porque contabilidad cerró el mes trabaría la
            operación diaria de la agencia.
          </p>
        </>
      )}
    </div>
  )
}
