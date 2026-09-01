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
import { FileText, Search } from "lucide-react"

interface Renglon {
  fecha: string
  tipo: string
  detalle: string
  operacion: string | null
  debe: number
  haber: number
  saldo: number
}

interface Cuenta {
  currency: string
  tipo: "CLIENTE" | "OPERADOR"
  renglones: Renglon[]
  totalDebe: number
  totalHaber: number
  saldoFinal: number
}

interface Extracto {
  tipo: "CLIENTE" | "OPERADOR"
  contraparte: string
  cuentas: Cuenta[]
}

interface Contraparte {
  id: string
  nombre: string
}

interface Props {
  operators: Array<{ id: string; name: string }>
}

const ETIQUETA: Record<string, string> = {
  VENTA: "Venta",
  COBRO: "Cobro",
  DEVOLUCION: "Devolución",
  COSTO: "Costo",
  PAGO: "Pago",
  AJUSTE: "Ajuste",
}

const plata = (n: number) =>
  n === 0 ? "" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** El saldo dicho con palabras, para no obligar a interpretar el signo. */
function leyenda(saldo: number, moneda: string): string {
  const abs = Math.abs(saldo).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (Math.abs(saldo) < 0.01) return "Sin saldo pendiente"
  return saldo > 0 ? `Nos debe ${moneda} ${abs}` : `Le debemos ${moneda} ${abs}`
}

export function CurrentAccountPageClient({ operators }: Props) {
  const [tipo, setTipo] = useState<"CLIENTE" | "OPERADOR">("CLIENTE")
  const [busqueda, setBusqueda] = useState("")
  const [resultados, setResultados] = useState<Contraparte[]>([])
  const [buscando, setBuscando] = useState(false)
  const [elegido, setElegido] = useState<Contraparte | null>(null)
  const [extracto, setExtracto] = useState<Extracto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Búsqueda de clientes contra la API que ya existe. Los operadores vienen
  // cargados de entrada: son pocos y no justifican un endpoint.
  const buscar = useCallback(async () => {
    if (tipo !== "CLIENTE" || busqueda.trim().length < 2) {
      setResultados([])
      return
    }
    setBuscando(true)
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(busqueda.trim())}&limit=10`)
      const json = await res.json()
      const filas = Array.isArray(json) ? json : json.customers ?? json.data ?? []
      setResultados(
        filas.slice(0, 10).map((c: any) => ({
          id: c.id,
          nombre: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || c.id,
        }))
      )
    } catch {
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }, [busqueda, tipo])

  useEffect(() => {
    const t = setTimeout(buscar, 350)
    return () => clearTimeout(t)
  }, [buscar])

  const cargar = useCallback(async () => {
    if (!elegido) return
    setLoading(true)
    setError(null)
    try {
      const p = tipo === "CLIENTE" ? `customerId=${elegido.id}` : `operatorId=${elegido.id}`
      const res = await fetch(`/api/accounting/current-account?${p}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo armar el extracto")
      setExtracto(json)
    } catch (e: any) {
      setError(e.message)
      setExtracto(null)
    } finally {
      setLoading(false)
    }
  }, [elegido, tipo])

  useEffect(() => {
    cargar()
  }, [cargar])

  function descargarPdf() {
    if (!elegido) return
    const p = tipo === "CLIENTE" ? `customerId=${elegido.id}` : `operatorId=${elegido.id}`
    window.open(`/api/accounting/current-account?${p}&formato=pdf`, "_blank")
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Cuenta de</label>
          <Select
            value={tipo}
            onValueChange={(v) => {
              setTipo(v as any)
              setElegido(null)
              setExtracto(null)
              setBusqueda("")
              setResultados([])
            }}
          >
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CLIENTE">Cliente</SelectItem>
              <SelectItem value="OPERADOR">Operador</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {tipo === "CLIENTE" ? (
          <div className="space-y-1.5">
            <label htmlFor="cc-buscar" className="text-xs font-medium text-muted-foreground">
              Buscar cliente
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="cc-buscar"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre o apellido"
                className="h-9 w-[260px] pl-8"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Operador</label>
            <Select
              value={elegido?.id ?? ""}
              onValueChange={(id) => {
                const o = operators.find((x) => x.id === id)
                if (o) setElegido({ id: o.id, nombre: o.name })
              }}
            >
              <SelectTrigger className="h-9 w-[260px]">
                <SelectValue placeholder="Elegí un operador" />
              </SelectTrigger>
              <SelectContent>
                {operators.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {extracto && (
          <Button size="sm" onClick={descargarPdf} className="h-9">
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            PDF
          </Button>
        )}
      </div>

      {/* Resultados de la búsqueda de clientes. */}
      {tipo === "CLIENTE" && resultados.length > 0 && !elegido && (
        <div className="rounded-md border">
          {resultados.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setElegido(c)
                setResultados([])
              }}
              className="block w-full border-b px-3.5 py-2 text-left text-sm last:border-0 hover:bg-muted/50"
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {tipo === "CLIENTE" && buscando && busqueda.trim().length >= 2 && (
        <p className="text-sm text-muted-foreground">Buscando…</p>
      )}

      {elegido && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{elegido.nombre}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => {
              setElegido(null)
              setExtracto(null)
            }}
          >
            Cambiar
          </Button>
        </div>
      )}

      {!elegido && (
        <p className="text-sm text-muted-foreground">
          Elegí una contraparte para ver su extracto: los movimientos con el saldo corrido al lado.
        </p>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-3 text-sm">
          <p className="font-medium text-destructive">No se pudo armar el extracto</p>
          <p className="mt-0.5 text-muted-foreground">{error}</p>
        </div>
      )}

      {!loading && extracto && extracto.cuentas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay operaciones ni pagos registrados para esta cuenta.
        </p>
      )}

      {!loading &&
        extracto?.cuentas.map((c) => (
          <section key={c.currency} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b py-1.5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Movimientos en {c.currency}
              </h3>
              <span
                className={`text-sm font-medium ${c.saldoFinal < 0 ? "text-destructive" : ""}`}
              >
                {leyenda(c.saldoFinal, c.currency)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-[90px] py-2 font-medium">Fecha</th>
                    <th className="w-[90px] py-2 font-medium">Tipo</th>
                    <th className="w-[140px] py-2 font-medium">Operación</th>
                    <th className="py-2 font-medium">Detalle</th>
                    <th className="w-[110px] py-2 text-right font-medium">Debe</th>
                    <th className="w-[110px] py-2 text-right font-medium">Haber</th>
                    <th className="w-[120px] py-2 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {c.renglones.map((r, i) => (
                    <tr key={`${r.fecha}-${i}`} className="border-b last:border-0">
                      <td className="py-1.5 text-muted-foreground">{r.fecha}</td>
                      <td className="py-1.5">{ETIQUETA[r.tipo] ?? r.tipo}</td>
                      <td className="py-1.5 font-mono text-xs text-muted-foreground">
                        {r.operacion ?? ""}
                      </td>
                      <td className="py-1.5 text-muted-foreground">{r.detalle}</td>
                      <td className="py-1.5 text-right tabular-nums">{plata(r.debe)}</td>
                      <td className="py-1.5 text-right tabular-nums">{plata(r.haber)}</td>
                      <td
                        className={`py-1.5 text-right font-medium tabular-nums ${
                          r.saldo < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {plata(r.saldo) || "0,00"}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-medium">
                    <td colSpan={4} className="py-2">
                      Totales
                    </td>
                    <td className="py-2 text-right tabular-nums">{plata(c.totalDebe)}</td>
                    <td className="py-2 text-right tabular-nums">{plata(c.totalHaber)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {plata(c.saldoFinal) || "0,00"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        ))}

      {!loading && extracto && extracto.cuentas.length > 0 && (
        <p className="text-sm text-muted-foreground">
          El saldo de esta cuenta netea todas las operaciones: un excedente pagado en un viaje se
          descuenta de lo adeudado por otro. La ficha de cada operación, en cambio, muestra su deuda
          por separado y nunca en negativo, así que los dos números pueden diferir.
        </p>
      )}
    </div>
  )
}
