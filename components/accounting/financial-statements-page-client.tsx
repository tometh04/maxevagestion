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
import { AlertTriangle, CalendarClock, RefreshCw } from "lucide-react"

interface Renglon {
  account_code: string
  account_name: string
  amount: number
}

interface Faltante {
  mes: string
  lineas: number
}

interface Respuesta {
  configurado: boolean
  message?: string
  desde?: string
  hasta?: string
  currency: "ARS" | "USD"
  resultados?: {
    ingresos: Renglon[]
    costos: Renglon[]
    gastos: Renglon[]
    totalIngresos: number
    totalCostos: number
    totalGastos: number
    resultado: number
    sinCotizacion: Faltante[]
  }
  balance?: {
    activo: Renglon[]
    pasivo: Renglon[]
    patrimonio: Renglon[]
    totalActivo: number
    totalPasivo: number
    totalPatrimonio: number
    descuadre: number
    orden: {
      deudoras: Renglon[]
      acreedoras: Renglon[]
      total: number
    }
    sinCotizacion: Faltante[]
  }
}

interface Props {
  agencies: Array<{ id: string; name: string }>
}

function monto(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Bloque de renglones con su subtotal. */
function Grupo({
  titulo,
  renglones,
  total,
  currency,
}: {
  titulo: string
  renglones: Renglon[]
  total: number
  currency: string
}) {
  if (renglones.length === 0) return null
  return (
    <div>
      <div className="flex items-baseline justify-between border-b py-1.5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </h3>
        <span className="tabular-nums text-sm font-semibold">{monto(total, currency)}</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {renglones.map((r) => (
            <tr key={r.account_code} className="border-b last:border-0">
              <td className="w-[90px] py-1.5 font-mono text-xs text-muted-foreground">
                {r.account_code}
              </td>
              <td className="py-1.5">{r.account_name}</td>
              <td className="py-1.5 text-right tabular-nums">
                {r.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function FinancialStatementsPageClient({ agencies }: Props) {
  const [agencyId, setAgencyId] = useState("ALL")
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<Respuesta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ hasta })
      if (agencyId !== "ALL") params.set("agencyId", agencyId)
      const res = await fetch(`/api/accounting/financial-statements?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudieron armar los estados")
      setData(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [agencyId, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  const faltantes = [
    ...(data?.resultados?.sinCotizacion ?? []),
    ...(data?.balance?.sinCotizacion ?? []),
  ]
  const mesesSinCotizacion = Array.from(new Set(faltantes.map((f) => f.mes))).sort()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        {agencies.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Agencia</label>
            <Select value={agencyId} onValueChange={setAgencyId}>
              <SelectTrigger className="h-9 w-[210px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas (consolidado)</SelectItem>
                {agencies.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="ec-hasta" className="text-xs font-medium text-muted-foreground">
            Hasta
          </label>
          <Input
            id="ec-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <Button variant="outline" size="sm" onClick={cargar} disabled={loading} className="h-9">
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-3 text-sm">
          <p className="font-medium text-destructive">No se pudieron armar los estados</p>
          <p className="mt-0.5 text-muted-foreground">{error}</p>
        </div>
      )}

      {/* Sin fecha de inicio no hay estado que emitir. Se manda a configurarlo
          en vez de mostrar un informe vacío que parezca un error. */}
      {!loading && data && !data.configurado && (
        <div className="flex flex-wrap items-start gap-3 rounded-md border border-accent-sand/40 bg-accent-sand/10 px-4 py-3.5">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-accent-sand" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-medium">Falta configurar la contabilidad</p>
            <p className="text-sm text-muted-foreground">{data.message}</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/finances/settings">Configurar</Link>
          </Button>
        </div>
      )}

      {!loading && data?.configurado && data.resultados && data.balance && (
        <div className="space-y-8">
          <p className="text-sm text-muted-foreground">
            Desde el {data.desde} hasta el {data.hasta}, expresado en{" "}
            <span className="font-medium text-foreground">{data.currency}</span>.
          </p>

          {mesesSinCotizacion.length > 0 && (
            <div className="flex gap-2.5 rounded-md border border-accent-sand/40 bg-accent-sand/10 px-3.5 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-sand" aria-hidden />
              <div className="space-y-1">
                <p className="font-medium">Faltan cotizaciones</p>
                <p className="text-muted-foreground">
                  No hay cotización cargada para {mesesSinCotizacion.join(", ")}, así que los
                  movimientos en otra moneda de {mesesSinCotizacion.length === 1 ? "ese mes" : "esos meses"}{" "}
                  quedaron fuera de estos estados. Se prefiere dejarlos afuera antes que valuarlos
                  con una cotización que no corresponde.
                </p>
              </div>
            </div>
          )}

          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Estado de Resultados</h2>
            <Grupo
              titulo="Ingresos"
              renglones={data.resultados.ingresos}
              total={data.resultados.totalIngresos}
              currency={data.currency}
            />
            <Grupo
              titulo="Costos"
              renglones={data.resultados.costos}
              total={data.resultados.totalCostos}
              currency={data.currency}
            />
            <Grupo
              titulo="Gastos"
              renglones={data.resultados.gastos}
              total={data.resultados.totalGastos}
              currency={data.currency}
            />
            <div className="flex items-baseline justify-between border-t-2 pt-3">
              <span className="font-semibold">Resultado del período</span>
              <span
                className={`text-lg font-semibold tabular-nums ${
                  data.resultados.resultado < 0 ? "text-destructive" : ""
                }`}
              >
                {monto(data.resultados.resultado, data.currency)}
              </span>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Balance</h2>
            <Grupo
              titulo="Activo"
              renglones={data.balance.activo}
              total={data.balance.totalActivo}
              currency={data.currency}
            />
            <Grupo
              titulo="Pasivo"
              renglones={data.balance.pasivo}
              total={data.balance.totalPasivo}
              currency={data.currency}
            />
            <Grupo
              titulo="Patrimonio Neto"
              renglones={data.balance.patrimonio}
              total={data.balance.totalPatrimonio}
              currency={data.currency}
            />

            {/* Al pie, aparte: no son activo, pasivo ni patrimonio. */}
            {data.balance.orden.deudoras.length > 0 && (
              <div className="space-y-3 border-t pt-5">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Cuentas de orden
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Compromisos que no son activo, pasivo ni resultado. Se informan al pie y no
                    afectan los totales de arriba.
                  </p>
                </div>
                <Grupo
                  titulo="Deudoras"
                  renglones={data.balance.orden.deudoras}
                  total={data.balance.orden.total}
                  currency={data.currency}
                />
                <Grupo
                  titulo="Acreedoras"
                  renglones={data.balance.orden.acreedoras}
                  total={data.balance.orden.total}
                  currency={data.currency}
                />
              </div>
            )}

            {data.balance.descuadre !== 0 && (
              <div className="flex gap-2.5 rounded-md border border-accent-sand/40 bg-accent-sand/10 px-3.5 py-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-sand" aria-hidden />
                <div className="space-y-1">
                  <p className="font-medium">
                    El balance no cierra por {monto(Math.abs(data.balance.descuadre), data.currency)}
                  </p>
                  <p className="text-muted-foreground">
                    El Activo debería igualar al Pasivo más el Patrimonio Neto. La diferencia se
                    muestra en vez de ocultarse: normalmente significa que falta el asiento de
                    apertura con los saldos con los que se arrancó, o que hay movimientos que
                    todavía no generan asiento.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
