"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
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
import { AlertCircle, Download, Loader2, PackageSearch } from "lucide-react"
import { toast } from "sonner"
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns"

interface SalesBreakdownReportProps {
  sellers: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
}

interface ReportProduct {
  key: string
  label: string
  color: string
  sale: number
  cost: number
  margin: number | null
  marginPct: number | null
  costOtherCurrency: number
  operations: number
  items: number
  share: number
}

interface ReportPayload {
  filters: {
    dateFrom: string
    dateTo: string
    currency: string
    agencyName: string | null
    sellerName: string | null
    ownDataOnly: boolean
  }
  report: {
    currency: string
    dateFrom: string
    dateTo: string
    summary: {
      sale: number
      cost: number
      margin: number
      marginPct: number
      operations: number
      averageTicket: number
      includeServices: boolean
      truncated: boolean
      otherCurrency: { currency: string; sale: number; operations: number } | null
      attribution: {
        operationsByItemSale: number
        operationsByItemCost: number
        operationsEven: number
        operationsWithoutItems: number
        itemsTotal: number
        residualAdjusted: number
      }
    }
    byProduct: ReportProduct[]
    bySeller: Array<{
      sellerId: string
      sellerName: string
      color: string
      sale: number
      margin: number
      marginPct: number
      operations: number
      share: number
      secondarySale: number
      secondaryOperations: number
      otherCurrencySale: number
    }>
    byAgency: Array<{
      agencyId: string | null
      agencyName: string
      sale: number
      margin: number
      marginPct: number
      operations: number
      share: number
      otherCurrencySale: number
    }>
    byMonth: Array<{
      key: string
      label: string
      sale: number
      cost: number
      margin: number
      operations: number
    }>
    byProductSeller: Array<{
      sellerId: string
      sellerName: string
      cells: Record<string, number>
    }>
    detail: Array<{
      operationId: string
      fileCode: string
      date: string
      destination: string
      sellerName: string
      agencyName: string
      products: Array<{ key: string; label: string; sale: number }>
      sale: number
      cost: number
      margin: number
      marginPct: number
      prorated: boolean
      attributionSource: string
    }>
  }
}

const DETAIL_PAGE_SIZE = 50

export function SalesBreakdownReport({ sellers, agencies }: SalesBreakdownReportProps) {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [detailLimit, setDetailLimit] = useState(DETAIL_PAGE_SIZE)

  const [dateFrom, setDateFrom] = useState(
    format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd")
  )
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"))
  const [currency, setCurrency] = useState("ARS")
  const [sellerId, setSellerId] = useState("ALL")
  const [agencyId, setAgencyId] = useState("ALL")

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ dateFrom, dateTo, currency })
    if (sellerId !== "ALL") params.set("sellerId", sellerId)
    if (agencyId !== "ALL") params.set("agencyId", agencyId)
    return params.toString()
  }, [dateFrom, dateTo, currency, sellerId, agencyId])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/sales-breakdown?${queryString}`)
      const result = await res.json()
      if (!res.ok) throw new Error(result?.error || "Error al cargar el reporte")
      setData(result)
      setDetailLimit(DETAIL_PAGE_SIZE)
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
      const res = await fetch(`/api/reports/sales-breakdown/pdf?${queryString}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || "No se pudo generar el PDF")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `reporte-ventas-${currency}-${dateFrom}_${dateTo}.pdf`
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

  const setQuickRange = (preset: "thisMonth" | "lastMonth" | "last3" | "last12") => {
    const today = new Date()
    if (preset === "thisMonth") {
      setDateFrom(format(startOfMonth(today), "yyyy-MM-dd"))
      setDateTo(format(endOfMonth(today), "yyyy-MM-dd"))
    } else if (preset === "lastMonth") {
      const prev = subMonths(today, 1)
      setDateFrom(format(startOfMonth(prev), "yyyy-MM-dd"))
      setDateTo(format(endOfMonth(prev), "yyyy-MM-dd"))
    } else if (preset === "last3") {
      setDateFrom(format(startOfMonth(subMonths(today, 2)), "yyyy-MM-dd"))
      setDateTo(format(endOfMonth(today), "yyyy-MM-dd"))
    } else {
      setDateFrom(format(startOfMonth(subMonths(today, 11)), "yyyy-MM-dd"))
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
  const summary = report?.summary
  const detail = report?.detail ?? []
  const visibleDetail = detail.slice(0, detailLimit)
  const products = report?.byProduct ?? []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Ventas por producto</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Qué se vendió (paquete, vuelo, hotel, asistencia), quién lo vendió y en qué
              oficina.
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
              <Label htmlFor="sb-from">Desde</Label>
              <Input
                id="sb-from"
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-to">Hasta</Label>
              <Input
                id="sb-to"
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sb-currency">Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="sb-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {sellers.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="sb-seller">Vendedor</Label>
                <Select value={sellerId} onValueChange={setSellerId}>
                  <SelectTrigger id="sb-seller">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    {sellers.map((seller) => (
                      <SelectItem key={seller.id} value={seller.id}>
                        {seller.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {agencies.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="sb-agency">Agencia</Label>
                <Select value={agencyId} onValueChange={setAgencyId}>
                  <SelectTrigger id="sb-agency">
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
            <Button variant="outline" size="sm" onClick={() => setQuickRange("last3")}>
              Últimos 3 meses
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickRange("last12")}>
              Últimos 12 meses
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <ReportSkeleton />
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
      ) : !report || summary?.operations === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <PackageSearch className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">Sin ventas en el período</p>
              <p className="text-sm text-muted-foreground mt-1">
                No hay operaciones en {currency} entre {formatShortDate(dateFrom)} y{" "}
                {formatShortDate(dateTo)} con los filtros aplicados.
                {summary?.otherCurrency
                  ? ` Sí hay ${summary.otherCurrency.operations} en ${summary.otherCurrency.currency}: cambiá la moneda para verlas.`
                  : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Ventas del período"
              value={money(summary!.sale)}
              hint={`${summary!.operations} operaciones`}
              emphasis
            />
            <KpiTile
              label="Costo"
              value={money(summary!.cost)}
              hint={`${(100 - summary!.marginPct).toFixed(1)}% de la venta`}
            />
            <KpiTile
              label="Margen"
              value={money(summary!.margin)}
              hint={`${summary!.marginPct.toFixed(1)}% sobre la venta`}
            />
            <KpiTile
              label="Ticket promedio"
              value={money(summary!.averageTicket)}
              hint={`${products.length} tipo(s) de producto`}
            />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {summary!.otherCurrency && (
              <span>
                También hay {summary!.otherCurrency.operations} operación(es) en{" "}
                {summary!.otherCurrency.currency} por{" "}
                {money(summary!.otherCurrency.sale, summary!.otherCurrency.currency)}, que no se
                suman acá.
              </span>
            )}
            {summary!.includeServices && <span>Incluye servicios adicionales.</span>}
            {summary!.truncated && (
              <span className="text-destructive">
                El período supera el máximo de filas: los totales son parciales, acotá el rango.
              </span>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ventas por tipo de producto</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{}} className="h-[280px] w-full">
                  <PieChart>
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          hideLabel
                          formatter={(value, name) => (
                            <div className="flex items-center justify-between gap-3 w-full">
                              <span className="text-muted-foreground">{name}</span>
                              <span className="font-medium tabular-nums">
                                {money(Number(value))}
                              </span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Pie
                      data={products}
                      dataKey="sale"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius="45%"
                      outerRadius="75%"
                      label={({ percent }: any) =>
                        percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""
                      }
                      labelLine={false}
                    >
                      {products.map((p) => (
                        <Cell key={p.key} fill={p.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evolución de ventas</CardTitle>
                <p className="text-sm text-muted-foreground">Total vendido por mes.</p>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{}} className="h-[260px] w-full">
                  <BarChart
                    data={report!.byMonth}
                    margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      interval="preserveStartEnd"
                      minTickGap={16}
                      className="text-xs"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={54}
                      tickFormatter={(value: number) => compact(value)}
                      className="text-xs"
                    />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          formatter={(value) => (
                            <span className="font-medium tabular-nums">{money(Number(value))}</span>
                          )}
                        />
                      }
                    />
                    <Bar dataKey="sale" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desglose por producto</CardTitle>
              <p className="text-sm text-muted-foreground">
                Una operación con varios productos cuenta en cada uno, por eso la columna de
                operaciones suma más que el total.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right w-[70px]">Ops</TableHead>
                      <TableHead className="text-right">Venta</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                      <TableHead className="text-right w-[90px]">% margen</TableHead>
                      <TableHead className="w-[160px]">% del total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p) => (
                      <TableRow key={p.key}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-sm shrink-0"
                              style={{ backgroundColor: p.color }}
                              aria-hidden="true"
                            />
                            <span className="text-sm font-medium">{p.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {p.operations}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {money(p.sale)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.margin != null ? (
                            money(p.margin)
                          ) : (
                            <Badge variant="outline" className="font-normal">
                              costo en otra moneda
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {p.marginPct != null ? `${p.marginPct.toFixed(1)}%` : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max(p.share, 1)}%`,
                                  backgroundColor: p.color,
                                }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground w-11 text-right">
                              {p.share.toFixed(1)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {summary!.operations}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {money(summary!.sale)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {money(summary!.margin)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {summary!.marginPct.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">100%</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por vendedor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report!.bySeller.map((s) => (
                  <div key={s.sellerId} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.sellerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.operations} operación(es) · {s.marginPct.toFixed(1)}% de margen
                        {s.secondaryOperations > 0
                          ? ` · ${s.secondaryOperations} como socio (${money(s.secondarySale)})`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">{money(s.sale)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {s.share.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
                {report!.bySeller.some((s) => s.secondaryOperations > 0) && (
                  <p className="text-xs text-muted-foreground pt-1">
                    En las ventas compartidas el importe se atribuye al vendedor principal, para
                    que la suma coincida con el total. La participación como socio se muestra
                    aparte y no se suma.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por agencia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report!.byAgency.map((a) => (
                  <div
                    key={a.agencyId ?? "sin-agencia"}
                    className="flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.agencyName}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.operations} operación(es) · {a.marginPct.toFixed(1)}% de margen
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">{money(a.sale)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {a.share.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {products.length > 1 && report!.byProductSeller.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Producto por vendedor</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-card">Vendedor</TableHead>
                        {products.map((p) => (
                          <TableHead key={p.key} className="text-right whitespace-nowrap">
                            {p.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report!.byProductSeller.map((row) => (
                        <TableRow key={row.sellerId}>
                          <TableCell className="font-medium sticky left-0 bg-card whitespace-nowrap">
                            {row.sellerName}
                          </TableCell>
                          {products.map((p) => (
                            <TableCell
                              key={p.key}
                              className="text-right tabular-nums whitespace-nowrap"
                            >
                              {row.cells[p.key] ? money(row.cells[p.key]) : "-"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold sticky left-0 bg-card">Total</TableCell>
                        {products.map((p) => (
                          <TableCell
                            key={p.key}
                            className="text-right font-semibold tabular-nums whitespace-nowrap"
                          >
                            {money(p.sale)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cómo se repartió la venta entre productos</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>
                La venta se registra a nivel operación y el tipo de producto a nivel ítem, así
                que de las {summary!.operations} operaciones del período:
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  {summary!.attribution.operationsByItemSale} se repartieron según el importe de
                  venta de cada ítem.
                </li>
                <li>
                  {summary!.attribution.operationsByItemCost} se repartieron según el costo de
                  cada ítem, porque no tenían importe de venta cargado.
                </li>
                <li>
                  {summary!.attribution.operationsEven} se repartieron en partes iguales, porque
                  sus costos estaban en monedas distintas.
                </li>
                <li>
                  {summary!.attribution.operationsWithoutItems} no tenían ítems: se imputaron
                  enteras al tipo de la operación.
                </li>
              </ul>
              <p>
                El reparto no altera el total: la suma de los productos es exactamente{" "}
                {money(summary!.sale)}.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalle de operaciones</CardTitle>
              <p className="text-sm text-muted-foreground">
                {detail.length} operación(es), de la venta más reciente a la más antigua.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">Fecha</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Productos</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                      <TableHead className="text-right">Venta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleDetail.map((row) => (
                      <TableRow key={row.operationId}>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatShortDate(row.date)}
                        </TableCell>
                        <TableCell className="font-medium">{row.fileCode}</TableCell>
                        <TableCell>{row.destination}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.products.map((p) => p.label).join(", ")}
                        </TableCell>
                        <TableCell className="text-sm">{row.sellerName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(row.margin)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {money(row.sale)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {detail.length > visibleDetail.length && (
                <div className="flex justify-center border-t p-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDetailLimit((n) => n + DETAIL_PAGE_SIZE * 4)}
                  >
                    Ver más ({detail.length - visibleDetail.length} restantes)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
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

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[340px] w-full" />
        <Skeleton className="h-[340px] w-full" />
      </div>
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
