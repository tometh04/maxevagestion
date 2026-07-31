"use client"

import { Fragment, useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
import { AlertCircle, Download, Coins, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns"

interface CommissionsReportProps {
  sellers: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
}

interface ReportSeller {
  sellerId: string
  sellerName: string
  color: string
  total: number
  pending: number
  paid: number
  count: number
  operationsCount: number
  primaryTotal: number
  secondaryTotal: number
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
    /** Lo resuelve el servidor: a un vendedor le fuerza todo en false. */
    include: { sale: boolean; margin: boolean; referrals: boolean }
  }
  report: {
    currency: string
    dateFrom: string
    dateTo: string
    summary: {
      total: number
      pending: number
      paid: number
      count: number
      operationsCount: number
      sellersCount: number
      averagePerSeller: number
      sharedOperations: number
      referredOperations: number
      cancelledRecords: number
      settledRecords: number
      truncated: boolean
      otherCurrency: { currency: string; total: number; count: number } | null
    }
    bySeller: ReportSeller[]
    byMonth: Array<{
      key: string
      label: string
      total: number
      pending: number
      paid: number
      count: number
      operationsCount: number
    }>
    bySellerMonth: Array<{
      sellerId: string
      sellerName: string
      cells: Record<string, number>
      total: number
    }>
    byAgency: Array<{
      agencyId: string | null
      agencyName: string
      total: number
      count: number
      share: number
    }>
    byStatus: Array<{ status: string; label: string; total: number; count: number; share: number }>
    detail: Array<{
      id: string
      operationId: string
      fileCode: string
      destination: string
      operationDate: string
      sellerId: string
      sellerName: string
      role: string
      saleAmount: number | null
      marginAmount: number | null
      percentage: number | null
      amount: number
      status: string
      shared: boolean
      counterpartName: string | null
      referralPartnerName: string | null
    }>
    byReferralPartner: Array<{
      partnerId: string
      partnerName: string
      operationsCount: number
      total: number
      pending: number
      paid: number
    }>
  }
}

const DETAIL_PAGE_SIZE = 50

export function CommissionsReport({ sellers, agencies }: CommissionsReportProps) {
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

  // Datos de la agencia, opt-in. El default es la vista que se le puede pasar a
  // un vendedor tal cual: solo lo que ganó él. El servidor los ignora si quien
  // pide el reporte solo puede ver lo suyo.
  const [includeSale, setIncludeSale] = useState(false)
  const [includeMargin, setIncludeMargin] = useState(false)
  const [includeReferrals, setIncludeReferrals] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ dateFrom, dateTo, currency })
    if (sellerId !== "ALL") params.set("sellerId", sellerId)
    if (agencyId !== "ALL") params.set("agencyId", agencyId)
    if (includeSale) params.set("includeSale", "true")
    if (includeMargin) params.set("includeMargin", "true")
    if (includeReferrals) params.set("includeReferrals", "true")
    return params.toString()
  }, [dateFrom, dateTo, currency, sellerId, agencyId, includeSale, includeMargin, includeReferrals])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/commissions?${queryString}`)
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
      const res = await fetch(`/api/reports/commissions/pdf?${queryString}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || "No se pudo generar el PDF")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `reporte-comisiones-${currency}-${dateFrom}_${dateTo}.pdf`
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
  const detail = useMemo(() => report?.detail ?? [], [report])
  const visibleDetail = useMemo(() => detail.slice(0, detailLimit), [detail, detailLimit])
  const months = report?.byMonth ?? []

  // El detalle se agrupa por vendedor, en el mismo orden que la tabla de arriba:
  // el reporte se le muestra a cada vendedor y lo suyo tiene que leerse junto.
  // El total del grupo es el del período completo (viene de `bySeller`), así que
  // cuando la paginación corta el grupo se aclara cuántas filas se están viendo.
  const groupedDetail = useMemo(() => {
    const byId = new Map<string, typeof visibleDetail>()
    for (const row of visibleDetail) {
      const list = byId.get(row.sellerId) || []
      list.push(row)
      byId.set(row.sellerId, list)
    }
    const ordered = (report?.bySeller ?? [])
      .filter((s) => byId.has(s.sellerId))
      .map((s) => ({
        sellerId: s.sellerId,
        sellerName: s.sellerName,
        color: s.color,
        total: s.total,
        count: s.count,
        rows: byId.get(s.sellerId)!,
      }))
    // Vendedores con comisiones en el detalle pero fuera de `bySeller` (defensivo).
    for (const [sellerId, rows] of Array.from(byId.entries())) {
      if (ordered.some((g) => g.sellerId === sellerId)) continue
      ordered.push({
        sellerId,
        sellerName: rows[0]?.sellerName || "Sin vendedor",
        color: "hsl(var(--muted-foreground))",
        total: rows.reduce((acc, r) => acc + r.amount, 0),
        count: rows.length,
        rows,
      })
    }
    return ordered
  }, [visibleDetail, report?.bySeller])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Reporte de comisiones</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Comisiones por vendedor y por mes de venta, con las operaciones compartidas
              detalladas.
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
              <Label htmlFor="com-from">Desde</Label>
              <Input
                id="com-from"
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="com-to">Hasta</Label>
              <Input
                id="com-to"
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="com-currency">Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="com-currency">
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
                <Label htmlFor="com-seller">Vendedor</Label>
                <Select value={sellerId} onValueChange={setSellerId}>
                  <SelectTrigger id="com-seller">
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
                <Label htmlFor="com-agency">Agencia</Label>
                <Select value={agencyId} onValueChange={setAgencyId}>
                  <SelectTrigger id="com-agency">
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

          {/*
            Lo que se agrega es información de la agencia. Por defecto no va
            ninguna: así el reporte se le puede pasar al vendedor tal cual, con
            lo que ganó él y nada más. Si el usuario solo puede ver sus propias
            comisiones no se muestran, porque el servidor los ignora igual.
          */}
          {!data?.filters.ownDataOnly && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-dashed p-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Agregar al reporte
              </span>
              <IncludeToggle
                id="com-inc-sale"
                label="Monto de la venta"
                checked={includeSale}
                onCheckedChange={setIncludeSale}
              />
              <IncludeToggle
                id="com-inc-margin"
                label="Ganancia de la operación"
                checked={includeMargin}
                onCheckedChange={setIncludeMargin}
              />
              <IncludeToggle
                id="com-inc-referrals"
                label="Comisiones de referidos"
                checked={includeReferrals}
                onCheckedChange={setIncludeReferrals}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Cada comisión se imputa al mes de la fecha de venta de la operación, no al de su
            cálculo.
          </p>
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
      ) : !report || summary?.count === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Coins className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">Sin comisiones en el período</p>
              <p className="text-sm text-muted-foreground mt-1">
                No hay comisiones en {currency} sobre ventas entre {formatShortDate(dateFrom)} y{" "}
                {formatShortDate(dateTo)} con los filtros aplicados.
                {summary?.otherCurrency
                  ? ` Sí hay ${summary.otherCurrency.count} en ${summary.otherCurrency.currency}: cambiá la moneda para verlas.`
                  : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Comisiones del período"
              value={money(summary!.total)}
              hint={`${summary!.count} comisiones · ${summary!.operationsCount} operaciones`}
              emphasis
            />
            <KpiTile
              label="Por pagar"
              value={money(summary!.pending)}
              hint={`${(report!.byStatus.find((s) => s.status === "PENDING")?.share ?? 0).toFixed(1)}% del total`}
            />
            <KpiTile
              label="Pagadas"
              value={money(summary!.paid)}
              hint={`${(report!.byStatus.find((s) => s.status === "PAID")?.share ?? 0).toFixed(1)}% del total`}
            />
            <KpiTile
              label="Promedio por vendedor"
              value={money(summary!.averagePerSeller)}
              hint={`${summary!.sellersCount} vendedor(es) con comisión en el período`}
            />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {summary!.otherCurrency && (
              <span>
                También hay {summary!.otherCurrency.count} comisión(es) en{" "}
                {summary!.otherCurrency.currency} por{" "}
                {money(summary!.otherCurrency.total, summary!.otherCurrency.currency)}, que no se
                suman acá.
              </span>
            )}
            {summary!.sharedOperations > 0 && (
              <span>
                {summary!.sharedOperations} operación(es) compartidas entre dos vendedores.
              </span>
            )}
            {summary!.referredOperations > 0 && (
              <span>
                {summary!.referredOperations} vinieron por un socio referidor; esa comisión se
                liquida aparte y no está incluida acá.
              </span>
            )}
            {summary!.cancelledRecords > 0 && (
              <span>
                {summary!.cancelledRecords} comisión(es) de operaciones canceladas quedaron fuera.
              </span>
            )}
            {summary!.settledRecords > 0 && (
              <span>
                {summary!.settledRecords} comisión(es) saldadas sin pago quedaron fuera: no son
                deuda.
              </span>
            )}
            {summary!.truncated && (
              <span className="text-destructive">
                El período supera el máximo de filas: los totales son parciales, acotá el rango.
              </span>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Participación por vendedor</CardTitle>
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
                      data={report!.bySeller}
                      dataKey="total"
                      nameKey="sellerName"
                      cx="50%"
                      cy="50%"
                      innerRadius="45%"
                      outerRadius="75%"
                      label={({ percent }: any) =>
                        percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""
                      }
                      labelLine={false}
                    >
                      {report!.bySeller.map((s) => (
                        <Cell key={s.sellerId} fill={s.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evolución mensual</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Por mes de venta, separando pagadas de pendientes.
                </p>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{}} className="h-[260px] w-full">
                  <BarChart data={months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <div className="flex items-center justify-between gap-3 w-full">
                              <span className="text-muted-foreground">
                                {name === "paid" ? "Pagadas" : "Por pagar"}
                              </span>
                              <span className="font-medium tabular-nums">
                                {money(Number(value))}
                              </span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Bar dataKey="paid" stackId="a" fill="hsl(var(--success))" />
                    <Bar
                      dataKey="pending"
                      stackId="a"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalle por vendedor</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right w-[70px]">Ops</TableHead>
                      <TableHead className="text-right">Por pagar</TableHead>
                      <TableHead className="text-right">Pagadas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[160px]">% del total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report!.bySeller.map((seller) => (
                      <TableRow key={seller.sellerId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-sm shrink-0"
                              style={{ backgroundColor: seller.color }}
                              aria-hidden="true"
                            />
                            <span className="text-sm font-medium">{seller.sellerName}</span>
                            {seller.secondaryTotal > 0 && (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                {money(seller.secondaryTotal)} como socio
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {seller.operationsCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(seller.pending)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-success">
                          {money(seller.paid)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {money(seller.total)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max(seller.share, 1)}%`,
                                  backgroundColor: seller.color,
                                }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground w-11 text-right">
                              {seller.share.toFixed(1)}%
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
                        {summary!.operationsCount}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {money(summary!.pending)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {money(summary!.paid)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {money(summary!.total)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">100%</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>

          {months.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Comisiones por vendedor y mes</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-card">Vendedor</TableHead>
                        {months.map((m) => (
                          <TableHead key={m.key} className="text-right whitespace-nowrap">
                            {m.label}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report!.bySellerMonth.map((row) => (
                        <TableRow key={row.sellerId}>
                          <TableCell className="font-medium sticky left-0 bg-card whitespace-nowrap">
                            {row.sellerName}
                          </TableCell>
                          {months.map((m) => (
                            <TableCell
                              key={m.key}
                              className="text-right tabular-nums whitespace-nowrap"
                            >
                              {row.cells[m.key] ? money(row.cells[m.key]) : "-"}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                            {money(row.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold sticky left-0 bg-card">Total</TableCell>
                        {months.map((m) => (
                          <TableCell
                            key={m.key}
                            className="text-right font-semibold tabular-nums whitespace-nowrap"
                          >
                            {money(m.total)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">
                          {money(summary!.total)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalle por vendedor</CardTitle>
              <p className="text-sm text-muted-foreground">
                Qué vendió cada uno y cuánto comisionó, de la venta más reciente a la más
                antigua.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">Fecha venta</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead>Tipo de venta</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Comisión</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedDetail.map((group) => (
                      <Fragment key={group.sellerId}>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableCell colSpan={4} className="py-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-3 w-3 rounded-sm shrink-0"
                                style={{ backgroundColor: group.color }}
                                aria-hidden="true"
                              />
                              <span className="font-semibold">{group.sellerName}</span>
                              <span className="text-xs text-muted-foreground">
                                {group.rows.length < group.count
                                  ? `${group.rows.length} de ${group.count} comisiones`
                                  : `${group.count} comisión${group.count === 1 ? "" : "es"}`}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-right text-xs text-muted-foreground">
                            Total
                          </TableCell>
                          <TableCell className="py-2 text-right font-semibold tabular-nums">
                            {money(group.total)}
                          </TableCell>
                        </TableRow>
                        {group.rows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="tabular-nums text-muted-foreground">
                              {formatShortDate(row.operationDate)}
                            </TableCell>
                            <TableCell className="font-medium">{row.fileCode}</TableCell>
                            <TableCell>
                              <span>{row.destination}</span>
                              {/*
                                Los datos opcionales van como sublínea y no como
                                columnas nuevas: mantiene la fila legible y hace
                                que tildar un checkbox no reacomode la tabla.
                              */}
                              {(row.saleAmount != null ||
                                row.marginAmount != null ||
                                row.referralPartnerName) && (
                                <span className="block text-xs text-muted-foreground">
                                  {[
                                    row.saleAmount != null ? `Venta ${money(row.saleAmount)}` : "",
                                    row.marginAmount != null
                                      ? `Ganancia ${money(row.marginAmount)}`
                                      : "",
                                    row.referralPartnerName
                                      ? `Cliente referido por ${row.referralPartnerName}`
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join("   ·   ")}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {saleTypeLabel(row)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={row.status === "PAID" ? "outline" : "secondary"}>
                                {row.status === "PAID" ? "Pagada" : "Por pagar"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {money(row.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
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

          {/*
            Sección aparte y fuera de todos los totales de arriba: la comisión
            del referidor es plata del socio que trajo el cliente, no sale de lo
            que cobra el vendedor ni se le informa a él.
          */}
          {report!.byReferralPartner.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Comisiones de referidos</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Lo que le corresponde a cada socio que trajo un cliente. No está incluido en
                  los totales de arriba.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Socio referidor</TableHead>
                        <TableHead className="text-right w-[70px]">Ops</TableHead>
                        <TableHead className="text-right">Por pagar</TableHead>
                        <TableHead className="text-right">Pagadas</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report!.byReferralPartner.map((partner) => (
                        <TableRow key={partner.partnerId}>
                          <TableCell className="font-medium">{partner.partnerName}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {partner.operationsCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(partner.pending)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-success">
                            {money(partner.paid)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {money(partner.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total referidos</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-semibold tabular-nums">
                          {money(
                            report!.byReferralPartner.reduce((acc, p) => acc + p.pending, 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {money(report!.byReferralPartner.reduce((acc, p) => acc + p.paid, 0))}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {money(report!.byReferralPartner.reduce((acc, p) => acc + p.total, 0))}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function IncludeToggle({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
      <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
        {label}
      </Label>
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

/** Origen de la venta: propia, compartida con otro vendedor, o como socio. */
function saleTypeLabel(row: {
  role: string
  shared: boolean
  counterpartName: string | null
}): string {
  if (!row.shared) return "Propia"
  if (row.role === "secondary") return `Socio de ${row.counterpartName || "otro vendedor"}`
  return `Compartida con ${row.counterpartName || "otro vendedor"}`
}

/** "2026-07-14" -> "14/07/2026" sin pasar por Date (evita corrimiento UTC). */
function formatShortDate(dateKey: string): string {
  if (!dateKey || dateKey.length < 10) return "-"
  const [y, m, d] = dateKey.split("-")
  return `${d}/${m}/${y}`
}
