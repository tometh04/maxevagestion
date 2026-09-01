"use client"

import { useCallback, useEffect, useState } from "react"
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
import { AlertTriangle, Download, FileText, RefreshCw } from "lucide-react"

interface LineaDelDiario {
  account_code: string
  account_name: string
  debe: number
  haber: number
  concepto: string
}

interface AsientoDelDiario {
  numero: number
  fecha: string
  descripcion: string
  currency: string
  lineas: LineaDelDiario[]
  totalDebe: number
  totalHaber: number
  descuadrado: boolean
}

interface Libro {
  desde: string
  hasta: string
  asientos: AsientoDelDiario[]
  totalesPorMoneda: Record<string, { debe: number; haber: number }>
  descuadrados: number
  vacios: number
  tamaño: { asientos: number; lineas: number }
}

interface Props {
  agencies: Array<{ id: string; name: string }>
}

const plata = (n: number) =>
  n === 0 ? "" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** El mes anterior completo, que es el rango con el que se encuaderna. */
function mesAnterior(): { desde: string; hasta: string } {
  const hoy = new Date()
  const fin = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1))
  fin.setUTCDate(0)
  const inicio = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), 1))
  return { desde: inicio.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) }
}

export function LibroDiarioPageClient({ agencies }: Props) {
  const inicial = mesAnterior()
  const [agencyId, setAgencyId] = useState("ALL")
  const [desde, setDesde] = useState(inicial.desde)
  const [hasta, setHasta] = useState(inicial.hasta)
  const [libro, setLibro] = useState<Libro | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const params = useCallback(() => {
    const p = new URLSearchParams({ desde, hasta })
    if (agencyId !== "ALL") p.set("agencyId", agencyId)
    return p
  }, [agencyId, desde, hasta])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/accounting/libro-diario?${params()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo armar el Libro Diario")
      setLibro(json)
    } catch (e: any) {
      setError(e.message)
      setLibro(null)
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => {
    cargar()
  }, [cargar])

  function descargar(formato: "pdf" | "csv") {
    const p = params()
    p.set("formato", formato)
    window.open(`/api/accounting/libro-diario?${p}`, "_blank")
  }

  const monedas = libro ? Object.keys(libro.totalesPorMoneda).sort() : []
  const sinDatos = !libro || libro.asientos.length === 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        {agencies.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Agencia</label>
            <Select value={agencyId} onValueChange={setAgencyId}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
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
          <label htmlFor="ld-desde" className="text-xs font-medium text-muted-foreground">
            Desde
          </label>
          <Input
            id="ld-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ld-hasta" className="text-xs font-medium text-muted-foreground">
            Hasta
          </label>
          <Input
            id="ld-hasta"
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
        <Button size="sm" onClick={() => descargar("pdf")} disabled={loading || sinDatos} className="h-9">
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => descargar("csv")}
          disabled={loading || sinDatos}
          className="h-9"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          CSV para el estudio
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        El libro se numera desde 1 dentro del período elegido, en orden cronológico. Un mes por vez
        es el rango habitual para encuadernar.
      </p>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-3 text-sm">
          <p className="font-medium text-destructive">No se pudo armar el Libro Diario</p>
          <p className="mt-0.5 text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && libro && libro.asientos.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay asientos registrados entre esas fechas.
        </p>
      )}

      {!loading && libro && libro.asientos.length > 0 && (
        <>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span>
              <span className="text-muted-foreground">Asientos: </span>
              <span className="font-medium tabular-nums">{libro.tamaño.asientos}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Líneas: </span>
              <span className="font-medium tabular-nums">{libro.tamaño.lineas}</span>
            </span>
            {monedas.map((m) => {
              const t = libro.totalesPorMoneda[m]
              const cierra = Math.abs(t.debe - t.haber) < 0.01
              return (
                <span key={m}>
                  <span className="text-muted-foreground">{m}: </span>
                  <span className={`font-medium tabular-nums ${cierra ? "" : "text-destructive"}`}>
                    {plata(t.debe)} / {plata(t.haber)}
                  </span>
                </span>
              )
            })}
          </div>

          {libro.descuadrados > 0 && (
            <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <div className="space-y-1">
                <p className="font-medium">
                  {libro.descuadrados === 1
                    ? "Un asiento no cuadra"
                    : `${libro.descuadrados} asientos no cuadran`}
                </p>
                <p className="text-muted-foreground">
                  Tienen una sola línea, así que su Debe y su Haber no coinciden. Se listan tal como
                  están registrados: corregirlos automáticamente alteraría el libro.
                </p>
              </div>
            </div>
          )}

          {libro.vacios > 0 && (
            <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <div className="space-y-1">
                <p className="font-medium">
                  {libro.vacios === 1
                    ? "Hay un asiento sin líneas en este período"
                    : `Hay ${libro.vacios} asientos sin líneas en este período`}
                </p>
                <p className="text-muted-foreground">
                  Quedaron fuera del libro: numerarlos dejaría un renglón en blanco. Suelen ser
                  restos de algo que se borró a medias, así que conviene revisarlos.
                </p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-[50px] py-2 font-medium">Nº</th>
                  <th className="w-[90px] py-2 font-medium">Fecha</th>
                  <th className="py-2 font-medium">Cuenta</th>
                  <th className="py-2 font-medium">Detalle</th>
                  <th className="w-[120px] py-2 text-right font-medium">Debe</th>
                  <th className="w-[120px] py-2 text-right font-medium">Haber</th>
                </tr>
              </thead>
              <tbody>
                {libro.asientos.map((a) =>
                  a.lineas.map((l, i) => (
                    <tr
                      key={`${a.numero}-${i}`}
                      className={`border-b last:border-0 ${i === 0 ? "border-t" : ""}`}
                    >
                      <td className="py-1.5 font-medium tabular-nums">{i === 0 ? a.numero : ""}</td>
                      <td className="py-1.5 text-muted-foreground">{i === 0 ? a.fecha : ""}</td>
                      <td className="py-1.5">
                        <span className="font-mono text-xs text-muted-foreground">
                          {l.account_code}
                        </span>{" "}
                        {l.account_name}
                      </td>
                      <td className="py-1.5 text-muted-foreground">{l.concepto}</td>
                      <td
                        className={`py-1.5 text-right tabular-nums ${
                          a.descuadrado ? "text-destructive" : ""
                        }`}
                      >
                        {plata(l.debe)}
                      </td>
                      <td
                        className={`py-1.5 text-right tabular-nums ${
                          a.descuadrado ? "text-destructive" : ""
                        }`}
                      >
                        {plata(l.haber)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
