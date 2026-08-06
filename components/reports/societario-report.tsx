"use client"

import { Fragment, useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Bar, BarChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import { AlertCircle, AlertTriangle, ChevronRight, Download, FileText, Loader2 } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns"

interface SocietarioReportProps {
  agencies: Array<{ id: string; name: string }>
}

interface Warning {
  code: string
  message: string
  level: "warning" | "danger"
}

interface BreakdownRow {
  key: string
  label: string
  amount: number
  hint?: string
  children?: BreakdownRow[]
}

interface WaterfallStep {
  key: string
  label: string
  amount: number
  kind: string
  breakdown?: BreakdownRow[]
}

interface ReportPayload {
  filters: {
    dateFrom: string
    dateTo: string
    currency: string
    agencyName: string | null
    exchangeRate: number | null
    ivaRatePct: number
  }
  report: {
    currency: string
    dateFrom: string
    dateTo: string
    conversion: { mode: "daily" | "fixed" | "none"; rate: number | null }
    ventas: {
      count: number
      total: number
      cost: number
      margin: number
      averageTicket: number
      marginPct: number
      marginRecalculated: number
      truncated: boolean
      missingRate: Array<{ currency: string; count: number; total: number }>
      byMonth: Array<{ key: string; label: string; ventas: number; margen: number; count: number }>
    }
    gastos: {
      total: number
      count: number
      recurring: number
      variable: number
      byCategory: Array<{ category: string; color: string; total: number; count: number; share: number }>
      excludedTouristic: number
      missingRate: Array<{ currency: string; count: number; total: number }>
    }
    financiero: {
      ingresos: number
      costos: number
      neto: number
      count: number
      countIngresos: number
      countCostos: number
      truncated: boolean
      missingRate: Array<{ currency: string; count: number; total: number }>
    }
    comisiones: {
      total: number
      sellers: { total: number; count: number }
      referrals: { total: number; count: number }
      baseLabel: string
      effectiveRate: number
      excluded: { settled: number; cancelled: number }
      missingRate: Array<{ currency: string; count: number; total: number }>
    }
    resultado: {
      ventas: number
      costoOperador: number
      gananciaBruta: number
      ivaRate: number
      ivaBase: number
      iva: number
      margenNetoIva: number
      comisiones: number
      gastos: number
      resultadoFinanciero: number
      gananciaNeta: number
      netMarginPct: number
      waterfall: WaterfallStep[]
    }
    socios: {
      percentageSum: number
      percentageValid: boolean
      unassignedAmount: number
      rows: Array<{
        partnerId: string
        name: string
        percentage: number
        amount: number
        color: string
      }>
    }
    allocations: {
      coversPeriod: boolean
      monthsInPeriod: number
      monthsWithAllocation: number
      total: number
      rows: Array<{
        partnerId: string
        name: string
        allocated: number
        computed: number
        difference: number | null
      }>
    } | null
    warnings: Warning[]
  }
}

const DEFAULT_IVA_RATE_PCT = "10.5"

export function SocietarioReport({ agencies }: SocietarioReportProps) {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  // Conceptos abiertos en la cascada. Arranca cerrada: el resumen se lee de
  // una, y el detalle está a un click cuando alguien pregunta de dónde sale.
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"))
  const [currency, setCurrency] = useState("USD")
  const [fixedRate, setFixedRate] = useState("")
  const [ivaRatePct, setIvaRatePct] = useState(DEFAULT_IVA_RATE_PCT)
  const [agencyId, setAgencyId] = useState("ALL")

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ dateFrom, dateTo, currency })
    if (fixedRate.trim() !== "" && Number(fixedRate) > 0) params.set("exchangeRate", fixedRate)
    if (ivaRatePct.trim() !== "") params.set("ivaRatePct", ivaRatePct)
    if (agencyId !== "ALL") params.set("agencyId", agencyId)
    return params.toString()
  }, [dateFrom, dateTo, currency, fixedRate, ivaRatePct, agencyId])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/societario?${queryString}`)
      const result = await res.json()
      if (!res.ok) throw new Error(result?.error || "Error al cargar el reporte")
      setData(result)
    } catch (err: any) {
      setError(err.message || "Error al cargar el reporte")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleDownloadPdf = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/reports/societario/pdf?${queryString}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || "No se pudo generar el PDF")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `reporte-societario-${currency}-${dateFrom}_${dateTo}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success("Reporte descargado")
    } catch (err: any) {
      toast.error(err.message || "No se pudo generar el PDF")
    } finally {
      setDownloading(false)
    }
  }

  const toggleStep = (key: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const setQuickRange = (preset: "thisMonth" | "lastMonth" | "thisYear") => {
    const today = new Date()
    if (preset === "thisMonth") {
      setDateFrom(format(startOfMonth(today), "yyyy-MM-dd"))
      setDateTo(format(endOfMonth(today), "yyyy-MM-dd"))
    } else if (preset === "lastMonth") {
      const prev = subMonths(today, 1)
      setDateFrom(format(startOfMonth(prev), "yyyy-MM-dd"))
      setDateTo(format(endOfMonth(prev), "yyyy-MM-dd"))
    } else {
      setDateFrom(format(new Date(today.getFullYear(), 0, 1), "yyyy-MM-dd"))
      setDateTo(format(endOfMonth(today), "yyyy-MM-dd"))
    }
  }

  const money = useCallback(
    (amount: number, currencyCode = currency) =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 2,
      }).format(amount || 0),
    [currency]
  )

  const compact = useCallback(
    (amount: number) => {
      const symbol = currency === "USD" ? "US$" : "$"
      const abs = Math.abs(amount)
      if (abs >= 1_000_000) return `${symbol} ${(amount / 1_000_000).toFixed(1)}M`
      if (abs >= 1_000) return `${symbol} ${Math.round(amount / 1_000)}k`
      return `${symbol} ${Math.round(amount)}`
    },
    [currency]
  )

  const report = data?.report
  const resultado = report?.resultado
  const socios = report?.socios
  // Un período con sólo movimientos financieros tiene resultado: decir "sin
  // movimientos" y mostrar un número distinto de cero sería contradictorio.
  const sinDatos =
    report &&
    report.ventas.count === 0 &&
    report.gastos.count === 0 &&
    report.financiero.count === 0

  return (
    <div className="space-y-6">
      {/* Filtros + acción de descarga */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Reporte societario</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Resultado del período y cuánto le corresponde a cada socio.
            </p>
          </div>
          <Button onClick={handleDownloadPdf} disabled={downloading || loading || !!error}>
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Descargar PDF
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="societario-from">Desde</Label>
              <Input
                id="societario-from"
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="societario-to">Hasta</Label>
              <Input
                id="societario-to"
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="societario-currency">Ver montos en</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="societario-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">Todo valuado en USD</SelectItem>
                  <SelectItem value="ARS">Todo valuado en ARS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="societario-iva">Alícuota de IVA (%)</Label>
              {/* Es un supuesto del reporte, no un dato del sistema: no existe
                  alícuota por operación. Editable para la org que factura al
                  21% o para la que ya carga el IVA como gasto (0). */}
              <Input
                id="societario-iva"
                type="number"
                min={0}
                max={100}
                step="0.5"
                inputMode="decimal"
                value={ivaRatePct}
                onChange={(e) => setIvaRatePct(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="societario-rate">Tipo de cambio</Label>
              <Input
                id="societario-rate"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="Del día de cada movimiento"
                value={fixedRate}
                onChange={(e) => setFixedRate(e.target.value)}
              />
            </div>
            {agencies.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="societario-agency">Oficina</Label>
                <Select value={agencyId} onValueChange={setAgencyId}>
                  <SelectTrigger id="societario-agency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas</SelectItem>
                    {agencies.map((agency) => (
                      <SelectItem key={agency.id} value={agency.id}>
                        {agency.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setQuickRange("thisMonth")}>
              Este mes
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickRange("lastMonth")}>
              Mes pasado
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickRange("thisYear")}>
              Este año
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <SocietarioReportSkeleton />
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-medium">No pudimos cargar el reporte</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
            <Button variant="outline" onClick={fetchReport}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : !report || sinDatos ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">Sin movimientos en el período</p>
              <p className="text-sm text-muted-foreground mt-1">
                No hay ventas ni gastos entre {formatShortDate(dateFrom)} y{" "}
                {formatShortDate(dateTo)} con los filtros aplicados.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Avisos: van arriba de todo, antes de cualquier número */}
          {report.warnings.length > 0 && (
            <div className="space-y-2">
              {report.warnings.map((w, i) => (
                <div
                  key={`${w.code}-${i}`}
                  className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                    w.level === "danger"
                      ? "border-destructive/40 bg-destructive/5 text-destructive"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Ganancia neta a repartir"
              value={money(resultado!.gananciaNeta)}
              hint={`${resultado!.netMarginPct.toFixed(1)}% sobre facturación`}
              emphasis
            />
            <KpiTile
              label="Ventas totales"
              value={money(report.ventas.total)}
              hint={`${report.ventas.count} ventas · ticket ${money(report.ventas.averageTicket)}`}
            />
            <KpiTile
              label="Ganancia bruta"
              value={money(resultado!.gananciaBruta)}
              hint={`${report.ventas.marginPct.toFixed(1)}% sobre la venta`}
            />
            <KpiTile
              label="Comisiones a repartir"
              value={money(resultado!.comisiones)}
              hint={`${report.comisiones.effectiveRate.toFixed(1)}% de la ganancia bruta`}
            />
          </div>

          {/* Cascada del resultado */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cómo se llega a la ganancia a repartir</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableBody>
                  {resultado!.waterfall.map((step) => {
                    const expandable = (step.breakdown?.length ?? 0) > 0
                    const open = expandedSteps.has(step.key)
                    return (
                      <Fragment key={step.key}>
                        <TableRow
                          className={
                            step.kind === "result" ? "bg-primary/5 font-semibold" : undefined
                          }
                        >
                          <TableCell
                            className={
                              step.kind === "subtotal" || step.kind === "result"
                                ? "font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {expandable ? (
                              <button
                                type="button"
                                onClick={() => toggleStep(step.key)}
                                aria-expanded={open}
                                className="flex items-center gap-1.5 rounded-sm text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight
                                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                                    open ? "rotate-90" : ""
                                  }`}
                                  aria-hidden="true"
                                />
                                {step.label}
                              </button>
                            ) : (
                              <span className={step.kind === "deduction" ? "pl-5" : undefined}>
                                {step.label}
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              step.amount < 0 ? "text-destructive" : ""
                            } ${step.kind === "result" ? "text-primary text-base" : ""}`}
                          >
                            {money(step.amount)}
                          </TableCell>
                        </TableRow>

                        {expandable &&
                          open &&
                          step.breakdown!.map((row) => (
                            <Fragment key={row.key}>
                              <TableRow className="border-0 bg-muted/30 hover:bg-muted/30">
                                <TableCell className="py-1.5 pl-10 text-sm text-muted-foreground">
                                  {row.label}
                                  {row.hint && (
                                    <span className="ml-2 text-xs opacity-70">{row.hint}</span>
                                  )}
                                </TableCell>
                                <TableCell className="py-1.5 text-right text-sm tabular-nums text-muted-foreground">
                                  {money(row.amount)}
                                </TableCell>
                              </TableRow>
                              {row.children?.map((child) => (
                                <TableRow
                                  key={child.key}
                                  className="border-0 bg-muted/30 hover:bg-muted/30"
                                >
                                  <TableCell className="py-1 pl-16 text-xs text-muted-foreground">
                                    {child.label}
                                    {child.hint && (
                                      <span className="ml-2 opacity-70">{child.hint}</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-1 text-right text-xs tabular-nums text-muted-foreground">
                                    {money(child.amount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </Fragment>
                          ))}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>

              <p className="text-xs text-muted-foreground">
                Tocá cada concepto para ver de dónde sale.
              </p>

              {/* La aclaración que evita el malentendido más probable: mover la
                  alícuota de IVA NO mueve las comisiones. */}
              <p className="text-xs text-muted-foreground">
                Las comisiones (vendedores y referidores) están calculadas sobre la{" "}
                {report.comisiones.baseLabel}, no sobre el margen neto de IVA. Cambiar la alícuota de
                este filtro no las modifica.
              </p>
              <p className="text-xs text-muted-foreground">
                El IVA de {data!.filters.ivaRatePct}% se estima sobre {money(resultado!.ivaBase)}, la
                suma de los márgenes positivos del período. Es un parámetro de este reporte: el
                sistema no guarda una alícuota por operación.
              </p>
              {report.gastos.excludedTouristic > 0 && (
                <p className="text-xs text-muted-foreground">
                  Se excluyeron {report.gastos.excludedTouristic} movimiento(s) turístico(s) —pagos a
                  operador y devoluciones— porque ya están descontados del margen. Por eso este total
                  de gastos es menor que el del reporte de Gastos.
                </p>
              )}
              {report.financiero.count > 0 && (
                <p className="text-xs text-muted-foreground">
                  El resultado financiero es la bonificación por depósito menos la comisión de la
                  financiera. No forma parte de los gastos operativos: es plata que entra y sale por
                  la forma de pagar a los operadores, no por hacer funcionar la agencia.
                </p>
              )}
              {(report.comisiones.excluded.settled > 0 ||
                report.comisiones.excluded.cancelled > 0) && (
                <p className="text-xs text-muted-foreground">
                  Quedaron fuera {report.comisiones.excluded.settled} comisión(es) saldada(s) y{" "}
                  {report.comisiones.excluded.cancelled} de operaciones canceladas.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Participación */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-base">Participación de los socios</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Reparto de {money(resultado!.gananciaNeta)} según la participación cargada.
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/accounting/partner-accounts">Editar participaciones</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {socios!.rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No hay socios activos cargados. Cargalos en Cuentas de Socios para ver el reparto.
                </p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Socio</TableHead>
                        <TableHead className="text-right">Participación</TableHead>
                        <TableHead className="text-right">Le corresponde</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {socios!.rows.map((s) => (
                        <TableRow key={s.partnerId}>
                          <TableCell className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-sm"
                              style={{ backgroundColor: s.color }}
                              aria-hidden="true"
                            />
                            {s.name}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.percentage.toFixed(2)}%
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums font-medium ${
                              s.amount < 0 ? "text-destructive" : ""
                            }`}
                          >
                            {money(s.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell>Total</TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            socios!.percentageValid ? "" : "text-destructive"
                          }`}
                        >
                          {socios!.percentageSum.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(resultado!.gananciaNeta - socios!.unassignedAmount)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>

                  <ChartContainer config={{}} className="h-[260px] w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie
                        data={socios!.rows}
                        dataKey="percentage"
                        nameKey="name"
                        innerRadius="45%"
                        outerRadius="75%"
                      >
                        {socios!.rows.map((s) => (
                          <Cell key={s.partnerId} fill={s.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Evolución mensual */}
          {report.ventas.byMonth.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ventas y margen por mes</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    ventas: { label: "Ventas", color: "hsl(var(--primary))" },
                    margen: { label: "Margen", color: "hsl(var(--chart-2))" },
                  }}
                  className="h-[280px] w-full"
                >
                  <BarChart data={report.ventas.byMonth}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis
                      tickFormatter={compact}
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      width={70}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="ventas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="margen" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Distribuciones ya registradas */}
          {report.allocations && report.allocations.rows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribución ya registrada</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {report.allocations.monthsWithAllocation} de {report.allocations.monthsInPeriod}{" "}
                  mes(es) del período tienen distribución cargada.
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Socio</TableHead>
                      <TableHead className="text-right">Distribuido</TableHead>
                      <TableHead className="text-right">Calculado</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.allocations.rows.map((row) => (
                      <TableRow key={row.partnerId}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(row.allocated)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(row.computed)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            row.difference != null && row.difference < 0 ? "text-destructive" : ""
                          }`}
                        >
                          {row.difference == null ? "—" : money(row.difference)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Gastos por categoría */}
          {report.gastos.byCategory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gastos del período</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {money(report.gastos.total)} · {money(report.gastos.recurring)} fijos +{" "}
                  {money(report.gastos.variable)} variables
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="text-right">Movimientos</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">% del total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.gastos.byCategory.map((c) => (
                      <TableRow key={c.category}>
                        <TableCell className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: c.color }}
                            aria-hidden="true"
                          />
                          {c.category}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(c.total)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {c.share.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function KpiTile({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string
  value: string
  hint: string
  emphasis?: boolean
}) {
  return (
    <div
      className={
        emphasis
          ? "rounded-lg border border-primary/30 bg-primary/5 p-4"
          : "rounded-lg border bg-card p-4"
      }
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-2 font-semibold tabular-nums ${
          emphasis ? "text-xl text-primary" : "text-lg"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function SocietarioReportSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] w-full" />
        ))}
      </div>
      <Skeleton className="h-[320px] w-full" />
      <Skeleton className="h-[280px] w-full" />
    </div>
  )
}

/** "2026-07-14" -> "14/07/2026" sin pasar por Date (evita corrimiento UTC). */
function formatShortDate(dateKey: string): string {
  if (!dateKey || dateKey.length < 10) return "-"
  const [y, m, d] = dateKey.split("-")
  return `${d}/${m}/${y}`
}
