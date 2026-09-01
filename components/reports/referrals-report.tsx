"use client"

import { Fragment, useState, useEffect, useCallback, useMemo } from "react"
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
import { AlertCircle, Download, Users, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns"

interface ReferralsReportProps {
  agencies: Array<{ id: string; name: string }>
}

interface ReportPartner {
  partnerId: string
  partnerName: string
  color: string
  total: number
  pending: number
  paid: number
  amountPaid: number
  count: number
  operationsCount: number
  share: number
}

interface ReportPayload {
  filters: {
    dateFrom: string
    dateTo: string
    currency: string
    agencyName: string | null
    partnerName: string | null
  }
  report: {
    currency: string
    dateFrom: string
    dateTo: string
    summary: {
      total: number
      pending: number
      paid: number
      amountPaid: number
      count: number
      operationsCount: number
      partnersCount: number
      averagePerPartner: number
      cancelledRecords: number
      truncated: boolean
      otherCurrency: { currency: string; total: number; count: number } | null
    }
    byPartner: ReportPartner[]
    byMonth: Array<{
      key: string
      label: string
      total: number
      pending: number
      paid: number
      count: number
    }>
    byPartnerMonth: Array<{
      partnerId: string
      partnerName: string
      cells: Record<string, number>
      total: number
    }>
    byAgency: Array<{
      agencyId: string | null
      agencyName: string
      total: number
      pending: number
      paid: number
      count: number
      share: number
    }>
    byStatus: Array<{ status: string; label: string; total: number; count: number; share: number }>
    detail: Array<{
      id: string
      operationId: string
      fileCode: string
      destination: string
      /** Oficina de la venta. Es de dónde sale la plata de esta comisión. */
      agencyId: string | null
      agencyName: string
      operationDate: string
      partnerId: string
      partnerName: string
      customerName: string | null
      percentage: number | null
      baseAmount: number | null
      amount: number
      amountPaid: number
      status: string
      paidWithoutSettlement: boolean
    }>
  }
}

const DETAIL_PAGE_SIZE = 50

export function ReferralsReport({ agencies }: ReferralsReportProps) {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [detailLimit, setDetailLimit] = useState(DETAIL_PAGE_SIZE)

  // Los referidores se cargan aparte: es una lista propia del módulo y no se le
  // pasa a todas las pestañas de Reportes desde el server.
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([])

  const [dateFrom, setDateFrom] = useState(
    format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd")
  )
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"))
  const [currency, setCurrency] = useState("ARS")
  const [partnerId, setPartnerId] = useState("ALL")
  const [agencyId, setAgencyId] = useState("ALL")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/referral-partners?include_inactive=true")
        if (!res.ok) return
        const body = await res.json()
        if (cancelled) return
        setPartners(
          (body.partners ?? []).map((p: any) => ({ id: p.id, name: p.name }))
        )
      } catch {
        // El filtro de referidor es opcional: si no carga, se sigue sin él.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ dateFrom, dateTo, currency })
    if (partnerId !== "ALL") params.set("partnerId", partnerId)
    if (agencyId !== "ALL") params.set("agencyId", agencyId)
    return params.toString()
  }, [dateFrom, dateTo, currency, partnerId, agencyId])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/referral-commissions?${queryString}`)
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
      const res = await fetch(`/api/reports/referral-commissions/pdf?${queryString}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || "No se pudo generar el PDF")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `reporte-referidores-${currency}-${dateFrom}_${dateTo}.pdf`
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
  /** Igual que en el reporte de comisiones: sólo con más de una oficina. */
  const showAgencyBreakdown = (report?.byAgency?.length ?? 0) > 1

  // El detalle se agrupa por referidor, en el mismo orden que la tabla de arriba.
  // El total del grupo es el del período completo (viene de `byPartner`), así que
  // cuando la paginación corta el grupo se aclara cuántas filas se están viendo.
  const groupedDetail = useMemo(() => {
    const byId = new Map<string, typeof visibleDetail>()
    for (const row of visibleDetail) {
      const list = byId.get(row.partnerId) || []
      list.push(row)
      byId.set(row.partnerId, list)
    }
    const ordered = (report?.byPartner ?? [])
      .filter((p) => byId.has(p.partnerId))
      .map((p) => ({
        partnerId: p.partnerId,
        partnerName: p.partnerName,
        color: p.color,
        total: p.total,
        count: p.count,
        rows: byId.get(p.partnerId)!,
      }))
    for (const [partnerId, rows] of Array.from(byId.entries())) {
      if (ordered.some((g) => g.partnerId === partnerId)) continue
      ordered.push({
        partnerId,
        partnerName: rows[0]?.partnerName || "Sin referidor",
        color: "hsl(var(--muted-foreground))",
        total: rows.reduce((acc, r) => acc + r.amount, 0),
        count: rows.length,
        rows,
      })
    }
    return ordered
  }, [visibleDetail, report?.byPartner])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Reporte de referidores</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Comisiones de cada socio que trajo un cliente, por referidor y por mes de venta.
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
              <Label htmlFor="ref-from">Desde</Label>
              <Input
                id="ref-from"
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-to">Hasta</Label>
              <Input
                id="ref-to"
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-currency">Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="ref-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {partners.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="ref-partner">Referidor</Label>
                <Select value={partnerId} onValueChange={setPartnerId}>
                  <SelectTrigger id="ref-partner">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    {partners.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        {partner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {agencies.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="ref-agency">Agencia</Label>
                <Select value={agencyId} onValueChange={setAgencyId}>
                  <SelectTrigger id="ref-agency">
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

          <p className="text-xs text-muted-foreground">
            Cada comisión se imputa al mes de la fecha de venta de la operación, no al de su
            cálculo. La comisión del referidor no sale de lo que cobra el vendedor.
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
            <Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">Sin comisiones de referidor en el período</p>
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
              label="Promedio por referidor"
              value={money(summary!.averagePerPartner)}
              hint={`${summary!.partnersCount} referidor(es) con comisión en el período`}
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
            {summary!.cancelledRecords > 0 && (
              <span>
                {summary!.cancelledRecords} comisión(es) de operaciones canceladas quedaron fuera.
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
                <CardTitle className="text-base">Participación por referidor</CardTitle>
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
                      data={report!.byPartner}
                      dataKey="total"
                      nameKey="partnerName"
                      cx="50%"
                      cy="50%"
                      innerRadius="45%"
                      outerRadius="75%"
                      label={({ percent }: any) =>
                        percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""
                      }
                      labelLine={false}
                    >
                      {report!.byPartner.map((p) => (
                        <Cell key={p.partnerId} fill={p.color} />
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
              <CardTitle className="text-base">Detalle por referidor</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referidor</TableHead>
                      <TableHead className="text-right w-[70px]">Ops</TableHead>
                      <TableHead className="text-right">Por pagar</TableHead>
                      <TableHead className="text-right">Pagadas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[160px]">% del total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report!.byPartner.map((partner) => (
                      <TableRow key={partner.partnerId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-sm shrink-0"
                              style={{ backgroundColor: partner.color }}
                              aria-hidden="true"
                            />
                            <span className="text-sm font-medium">{partner.partnerName}</span>
                          </div>
                        </TableCell>
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
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max(partner.share, 1)}%`,
                                  backgroundColor: partner.color,
                                }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground w-11 text-right">
                              {partner.share.toFixed(1)}%
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
                <CardTitle className="text-base">Comisiones por referidor y mes</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-card">Referidor</TableHead>
                        {months.map((m) => (
                          <TableHead key={m.key} className="text-right whitespace-nowrap">
                            {m.label}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report!.byPartnerMonth.map((row) => (
                        <TableRow key={row.partnerId}>
                          <TableCell className="font-medium sticky left-0 bg-card whitespace-nowrap">
                            {row.partnerName}
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
              <CardTitle className="text-base">Detalle por referidor</CardTitle>
              <p className="text-sm text-muted-foreground">
                Qué operaciones trajo cada referidor y cuánto le corresponde, de la venta más
                reciente a la más antigua.
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
                      <TableHead>Cliente</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Comisión</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedDetail.map((group) => (
                      <Fragment key={group.partnerId}>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableCell colSpan={4} className="py-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-3 w-3 rounded-sm shrink-0"
                                style={{ backgroundColor: group.color }}
                                aria-hidden="true"
                              />
                              <span className="font-semibold">{group.partnerName}</span>
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
                              {(showAgencyBreakdown ||
                                row.percentage != null ||
                                row.baseAmount != null) && (
                                <span className="block text-xs text-muted-foreground">
                                  {[
                                    showAgencyBreakdown ? row.agencyName : "",
                                    row.percentage != null ? `${row.percentage}%` : "",
                                    row.baseAmount != null ? `sobre ${money(row.baseAmount)}` : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.customerName || "-"}
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
