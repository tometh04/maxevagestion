"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertTriangle, Check, RefreshCw } from "lucide-react"

interface Linea {
  codigo: string
  debe: number
  haber: number
  detalle: string
}

interface Asiento {
  currency: string
  lineas: Linea[]
  resultadosAcumulados: number
  totalDebe: number
  totalHaber: number
}

interface Anomalia {
  operationId: string
  numero: string
  motivo: string
  venta: number
  cobrado: number
  currency: string
}

interface Datos {
  configurado: boolean
  error?: string
  fechaDeInicio?: string
  corte?: string
  asientos?: Asiento[]
  cuentasSinPlan?: string[]
  excluidas?: string[]
  anomalias?: Anomalia[]
  yaGenerado?: boolean
}

const plata = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function OpeningEntryCard({ agencyId }: { agencyId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!agencyId) return
    setLoading(true)
    setError(null)
    setHecho(null)
    try {
      const res = await fetch(`/api/accounting/opening-entry?agencyId=${agencyId}`)
      const json = await res.json()
      // Un 409 acá no es una falla: significa que falta configurar la fecha.
      if (!res.ok && json.configurado !== false) {
        throw new Error(json.error || "No se pudo calcular la apertura")
      }
      setDatos(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [agencyId])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function generar() {
    setGenerando(true)
    setError(null)
    try {
      const res = await fetch("/api/accounting/opening-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, reemplazar: datos?.yaGenerado === true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo generar")
      setHecho(
        `${json.asientosCreados} ${json.asientosCreados === 1 ? "asiento generado" : "asientos generados"}` +
          (json.asientosBorrados > 0 ? `, reemplazando ${json.asientosBorrados} anteriores` : "")
      )
      await cargar()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerando(false)
    }
  }

  if (loading) return <Skeleton className="h-40 w-full" />

  // Sin fecha de inicio no hay nada que abrir. El aviso ya lo da la pantalla de
  // cierre, así que acá no se repite.
  if (!datos || datos.configurado === false) return null

  const asientos = datos.asientos ?? []
  const anomalias = datos.anomalias ?? []

  return (
    <section className="space-y-4 rounded-md border px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-medium">Asiento de apertura</h3>
          <p className="text-sm text-muted-foreground">
            {asientos.length === 0
              ? "No hay saldos previos al inicio de la contabilidad, así que no hace falta apertura."
              : `Retrata cómo quedó la agencia al cierre del ${datos.corte}, que es el día anterior al inicio de la contabilidad. Los saldos salen de lo que el sistema ya registra.`}
          </p>
        </div>
        {asientos.length > 0 && (
          <Button size="sm" onClick={generar} disabled={generando}>
            {generando && <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {datos.yaGenerado ? "Regenerar" : "Confirmar y generar"}
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-3 text-sm">
          <p className="font-medium text-destructive">No se pudo generar</p>
          <p className="mt-0.5 text-muted-foreground">{error}</p>
        </div>
      )}

      {hecho && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3.5 py-2.5 text-sm">
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          {hecho}
        </div>
      )}

      {datos.yaGenerado && !hecho && (
        <p className="text-sm text-muted-foreground">
          Ya está generado. Regenerarlo lo reemplaza por el cálculo de hoy, y no se puede si hay
          meses cerrados que se apoyan en él.
        </p>
      )}

      {asientos.map((a) => (
        <div key={a.currency} className="space-y-1.5">
          <div className="flex items-baseline justify-between border-b py-1.5">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              En {a.currency}
            </h4>
            <span className="text-sm text-muted-foreground">
              Patrimonio inicial {plata(a.resultadosAcumulados)} {a.currency}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <tbody>
                {a.lineas.map((l, i) => (
                  <tr key={`${l.codigo}-${i}`} className="border-b last:border-0">
                    <td className="w-[70px] py-1.5 font-mono text-xs text-muted-foreground">
                      {l.codigo}
                    </td>
                    <td className="py-1.5">{l.detalle}</td>
                    <td className="w-[130px] py-1.5 text-right tabular-nums">
                      {l.debe > 0 ? plata(l.debe) : ""}
                    </td>
                    <td className="w-[130px] py-1.5 text-right tabular-nums">
                      {l.haber > 0 ? plata(l.haber) : ""}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 font-medium">
                  <td colSpan={2} className="py-1.5">
                    Totales
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{plata(a.totalDebe)}</td>
                  <td className="py-1.5 text-right tabular-nums">{plata(a.totalHaber)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {anomalias.length > 0 && (
        <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
          <div className="flex gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div>
              <p className="text-sm font-medium">
                {anomalias.length === 1
                  ? "Una operación quedó fuera del asiento"
                  : `${anomalias.length} operaciones quedaron fuera del asiento`}
              </p>
              <p className="text-sm text-muted-foreground">
                Lo cobrado supera lo vendido por tanto que el importe de venta casi seguro esté mal
                cargado. Registrarlo declararía una deuda con el cliente que la agencia no tiene, así
                que la contrapartida quedó dentro del patrimonio inicial. La plata que entró sigue
                estando en las cuentas.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <tbody>
                {anomalias.map((a, i) => (
                  <tr key={`${a.operationId}-${i}`} className="border-b last:border-0">
                    <td className="py-1.5 font-mono text-xs">{a.numero}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                      {a.currency} {plata(a.venta)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {a.currency} {plata(a.cobrado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(datos.cuentasSinPlan?.length ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground">
          Sin cuenta contable asignada, y por eso fuera del asiento:{" "}
          {datos.cuentasSinPlan!.join(", ")}. Asignásela desde Cuentas Financieras para que su saldo
          entre.
        </p>
      )}
    </section>
  )
}
