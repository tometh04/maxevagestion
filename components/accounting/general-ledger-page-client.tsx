"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from "lucide-react"

interface AccountRow {
  chart_account_id: string
  account_code: string
  account_name: string
  category: string
  currency: string
  debit: number
  credit: number
  balance: number
  movements: number
}

interface LedgerLine {
  id: string
  movement_date: string
  concept: string
  currency: string
  debit: number
  credit: number
  running_balance: number
  entry_number: number | null
  entry_description: string | null
  source: string | null
  operation_id: string | null
  file_code: string | null
  destination: string | null
}

interface Coverage {
  classified: number
  unclassified: number
  total: number
  pct: number
}

const CATEGORIAS: { key: string; label: string }[] = [
  { key: "ACTIVO", label: "Activo" },
  { key: "PASIVO", label: "Pasivo" },
  { key: "PATRIMONIO_NETO", label: "Patrimonio neto" },
  { key: "RESULTADO", label: "Resultado" },
]

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function primerDiaDelAnio() {
  return `${new Date().getFullYear()}-01-01`
}

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

export function GeneralLedgerPageClient() {
  const [dateFrom, setDateFrom] = useState(primerDiaDelAnio)
  const [dateTo, setDateTo] = useState(hoy)
  const [currency, setCurrency] = useState("ALL")

  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [totals, setTotals] = useState<Record<string, { debit: number; credit: number }>>({})
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [abierta, setAbierta] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<Record<string, LedgerLine[]>>({})
  const [cargandoDetalle, setCargandoDetalle] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (currency !== "ALL") params.set("currency", currency)
      const res = await fetch(`/api/accounting/general-ledger?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo cargar el mayor")
      setAccounts(json.accounts ?? [])
      setTotals(json.totals ?? {})
      setCoverage(json.coverage ?? null)
      setAbierta(null)
      setDetalle({})
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, currency])

  useEffect(() => {
    cargar()
  }, [cargar])

  const abrir = async (row: AccountRow) => {
    const key = `${row.chart_account_id}|${row.currency}`
    if (abierta === key) {
      setAbierta(null)
      return
    }
    setAbierta(key)
    if (detalle[key]) return

    setCargandoDetalle(key)
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        chartAccountId: row.chart_account_id,
        currency: row.currency,
      })
      const res = await fetch(`/api/accounting/general-ledger?${params}`)
      const json = await res.json()
      if (res.ok) setDetalle((d) => ({ ...d, [key]: json.movements ?? [] }))
    } finally {
      setCargandoDetalle(null)
    }
  }

  const monedas = Object.keys(totals).sort()

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="mayor-desde" className="text-xs font-medium text-muted-foreground">
            Desde
          </label>
          <Input
            id="mayor-desde"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="mayor-hasta" className="text-xs font-medium text-muted-foreground">
            Hasta
          </label>
          <Input
            id="mayor-hasta"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 w-[150px]"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="mayor-moneda" className="text-xs font-medium text-muted-foreground">
            Moneda
          </label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="mayor-moneda" className="h-9 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              <SelectItem value="ARS">ARS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={cargar} disabled={loading} className="h-9">
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Cobertura: sin esto, esta pantalla se lee como un balance cerrado y no lo es. */}
      {coverage && coverage.unclassified > 0 && (
        <div className="flex gap-2.5 rounded-md border border-accent-sand/40 bg-accent-sand/10 px-3.5 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-sand" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">Vista contable parcial</p>
            <p className="text-muted-foreground">
              {coverage.classified.toLocaleString("es-AR")} de{" "}
              {coverage.total.toLocaleString("es-AR")} movimientos del período tienen cuenta
              contable ({coverage.pct}%). Los{" "}
              {coverage.unclassified.toLocaleString("es-AR")} restantes son cobros, gastos y pagos
              a operadores que todavía no generan asiento, así que el Debe y el Haber no cierran
              entre sí.
            </p>
          </div>
        </div>
      )}

      {/* Totales por moneda */}
      {!loading && monedas.length > 0 && (
        <div className="flex flex-wrap gap-x-8 gap-y-2 border-y py-3">
          {monedas.map((m) => (
            <div key={m} className="flex items-baseline gap-2 text-sm">
              <span className="font-medium">{m}</span>
              <span className="text-muted-foreground">Debe</span>
              <span className="tabular-nums font-medium">
                {totals[m].debit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-muted-foreground">Haber</span>
              <span className="tabular-nums font-medium">
                {totals[m].credit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3.5 py-3 text-sm">
          <p className="font-medium text-destructive">No se pudo cargar el mayor</p>
          <p className="mt-0.5 text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={cargar} className="mt-2.5 h-8">
            Reintentar
          </Button>
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {!loading && !error && accounts.length === 0 && (
        <div className="rounded-md border border-dashed px-4 py-10 text-center">
          <p className="text-sm font-medium">No hay movimientos con cuenta contable</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Probá ampliar el rango de fechas. Las operaciones generan su asiento al confirmarse.
          </p>
        </div>
      )}

      {!loading && !error && accounts.length > 0 && (
        <div className="space-y-7">
          {CATEGORIAS.map(({ key, label }) => {
            const filas = accounts.filter((a) => a.category === key)
            if (filas.length === 0) return null

            const subtotales: Record<string, number> = {}
            for (const f of filas) {
              subtotales[f.currency] = (subtotales[f.currency] ?? 0) + f.balance
            }

            return (
              <section key={key}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </h2>
                  <div className="flex gap-4 text-sm">
                    {Object.entries(subtotales).map(([cur, saldo]) => (
                      <span key={cur} className="tabular-nums">
                        <span className="text-muted-foreground">Saldo </span>
                        <span className="font-medium">{money(saldo, cur)}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Código</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead className="w-[70px]">Moneda</TableHead>
                      <TableHead className="w-[70px] text-right">Movs.</TableHead>
                      <TableHead className="w-[140px] text-right">Debe</TableHead>
                      <TableHead className="w-[140px] text-right">Haber</TableHead>
                      <TableHead className="w-[150px] text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((row) => {
                      const rowKey = `${row.chart_account_id}|${row.currency}`
                      const abiertaEsta = abierta === rowKey
                      const lineas = detalle[rowKey]

                      return (
                        <Fragment key={rowKey}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() => abrir(row)}
                          >
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {row.account_code}
                            </TableCell>
                            <TableCell>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  abrir(row)
                                }}
                                aria-expanded={abiertaEsta}
                                className="flex items-center gap-1.5 text-left font-medium hover:underline"
                              >
                                {abiertaEsta ? (
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                )}
                                {row.account_name}
                              </button>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs">
                                {row.currency}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {row.movements}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.debit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.credit.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {row.balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>

                          {abiertaEsta && (
                            <TableRow key={`${rowKey}-detalle`} className="hover:bg-transparent">
                              <TableCell colSpan={7} className="bg-muted/30 p-0">
                                {cargandoDetalle === rowKey && (
                                  <div className="space-y-1.5 p-3">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                      <Skeleton key={i} className="h-7 w-full" />
                                    ))}
                                  </div>
                                )}

                                {lineas && lineas.length === 0 && (
                                  <p className="px-4 py-5 text-center text-sm text-muted-foreground">
                                    Sin movimientos en el período.
                                  </p>
                                )}

                                {lineas && lineas.length > 0 && (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b text-xs text-muted-foreground">
                                          <th className="px-4 py-2 text-left font-medium">Fecha</th>
                                          <th className="px-3 py-2 text-left font-medium">
                                            Asiento
                                          </th>
                                          <th className="px-3 py-2 text-left font-medium">
                                            Concepto
                                          </th>
                                          <th className="px-3 py-2 text-right font-medium">Debe</th>
                                          <th className="px-3 py-2 text-right font-medium">
                                            Haber
                                          </th>
                                          <th className="px-4 py-2 text-right font-medium">
                                            Saldo
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {lineas.map((l) => (
                                          <tr key={l.id} className="border-b last:border-0">
                                            <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground">
                                              {l.movement_date?.slice(0, 10)}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                                              {l.entry_number ? `#${l.entry_number}` : "—"}
                                            </td>
                                            <td className="px-3 py-2">
                                              {l.concept}
                                              {l.file_code && (
                                                <span className="ml-1.5 text-xs text-muted-foreground">
                                                  {l.file_code}
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                              {l.debit
                                                ? l.debit.toLocaleString("es-AR", {
                                                    minimumFractionDigits: 2,
                                                  })
                                                : ""}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                              {l.credit
                                                ? l.credit.toLocaleString("es-AR", {
                                                    minimumFractionDigits: 2,
                                                  })
                                                : ""}
                                            </td>
                                            <td className="px-4 py-2 text-right font-medium tabular-nums">
                                              {l.running_balance.toLocaleString("es-AR", {
                                                minimumFractionDigits: 2,
                                              })}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
