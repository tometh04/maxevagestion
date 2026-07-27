"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
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
import { AlertCircle, Download, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { format, startOfMonth, endOfMonth, subDays, subMonths } from "date-fns"

interface ExpensesReportProps {
  agencies: Array<{ id: string; name: string }>
}

interface ReportCategory {
  category: string
  color: string
  total: number
  count: number
  share: number
}

interface ReportPayload {
  filters: {
    dateFrom: string
    dateTo: string
    currency: string
    agencyName: string | null
    agencyMode: "office" | "account"
    type: "recurring" | "variable" | null
  }
  report: {
    currency: string
    dateFrom: string
    dateTo: string
    summary: {
      total: number
      count: number
      average: number
      dailyAverage: number
      days: number
      topCategory: { category: string; total: number; share: number } | null
      otherCurrency: { currency: string; total: number; count: number } | null
    }
    byCategory: ReportCategory[]
    byType: Array<{ type: string; label: string; total: number; count: number; share: number }>
    byBucket: Array<{ key: string; label: string; total: number; count: number }>
    bucketMode: "day" | "month"
    byAccount: Array<{ account: string; total: number; count: number }>
    detail: Array<{
      id: string
      date: string
      description: string
      category: string
      categoryColor: string
      type: string
      account: string
      user: string
      amount: number
    }>
  }
}

const DETAIL_PAGE_SIZE = 50

export function ExpensesReport({ agencies }: ExpensesReportProps) {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [detailLimit, setDetailLimit] = useState(DETAIL_PAGE_SIZE)

  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"))
  const [currency, setCurrency] = useState("ARS")
  const [agencyId, setAgencyId] = useState("ALL")
  // Criterio del filtro por agencia: "office" = oficina a la que se cargó el
  // gasto; "account" = oficina de la cuenta desde la que salió la plata.
  const [agencyMode, setAgencyMode] = useState<"office" | "account">("office")
  const [type, setType] = useState("ALL")

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ dateFrom, dateTo, currency })
    if (agencyId !== "ALL") {
      params.set("agencyId", agencyId)
      params.set("agencyMode", agencyMode)
    }
    if (type !== "ALL") params.set("type", type)
    return params.toString()
  }, [dateFrom, dateTo, currency, agencyId, agencyMode, type])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/expenses?${queryString}`)
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
      const res = await fetch(`/api/reports/expenses/pdf?${queryString}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || "No se pudo generar el PDF")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `reporte-gastos-${currency}-${dateFrom}_${dateTo}.pdf`
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

  const setQuickRange = (preset: "thisMonth" | "lastMonth" | "last90") => {
    const today = new Date()
    if (preset === "thisMonth") {
      setDateFrom(format(startOfMonth(today), "yyyy-MM-dd"))
      setDateTo(format(endOfMonth(today), "yyyy-MM-dd"))
    } else if (preset === "lastMonth") {
      const prev = subMonths(today, 1)
      setDateFrom(format(startOfMonth(prev), "yyyy-MM-dd"))
      setDateTo(format(endOfMonth(prev), "yyyy-MM-dd"))
    } else {
      setDateFrom(format(subDays(today, 89), "yyyy-MM-dd"))
      setDateTo(format(today, "yyyy-MM-dd"))
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
  const recurring = report?.byType.find((t) => t.type === "recurring")
  const variable = report?.byType.find((t) => t.type === "variable")
  const detail = report?.detail ?? []
  const visibleDetail = detail.slice(0, detailLimit)

  return (
    <div className="space-y-6">
      {/* Filtros + acción de descarga */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Reporte de gastos</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Gastos fijos y variables ya pagados, listos para presentar.
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
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-1.5">
              <Label htmlFor="expenses-report-from">Desde</Label>
              <Input
                id="expenses-report-from"
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expenses-report-to">Hasta</Label>
              <Input
                id="expenses-report-to"
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expenses-report-currency">Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="expenses-report-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expenses-report-type">Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="expenses-report-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Fijos + Variables</SelectItem>
                  <SelectItem value="recurring">Solo fijos</SelectItem>
                  <SelectItem value="variable">Solo variables</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {agencies.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="expenses-report-agency">Agencia</Label>
                <Select value={agencyId} onValueChange={setAgencyId}>
                  <SelectTrigger id="expenses-report-agency">
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
            {agencies.length > 1 && agencyId !== "ALL" && (
              <div className="space-y-1.5">
                <Label htmlFor="expenses-report-agency-mode">Atribuir por</Label>
                <Select
                  value={agencyMode}
                  onValueChange={(v) => setAgencyMode(v as "office" | "account")}
                >
                  <SelectTrigger id="expenses-report-agency-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="office">Oficina del gasto</SelectItem>
                    <SelectItem value="account">Cuenta pagadora</SelectItem>
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
            <Button variant="outline" size="sm" onClick={() => setQuickRange("last90")}>
              Últimos 90 días
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <ExpensesReportSkeleton />
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
            <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">Sin gastos en el período</p>
              <p className="text-sm text-muted-foreground mt-1">
                No hay gastos en {currency} entre {formatShortDate(dateFrom)} y{" "}
                {formatShortDate(dateTo)} con los filtros aplicados.
                {summary?.otherCurrency
                  ? ` Sí hay ${summary.otherCurrency.count} gasto(s) en ${summary.otherCurrency.currency}: cambiá la moneda para verlos.`
                  : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              label="Total del período"
              value={money(summary!.total)}
              hint={`${summary!.count} gastos · ${summary!.days} días`}
              emphasis
            />
            <KpiTile
              label="Fijos / Recurrentes"
              value={money(recurring?.total || 0)}
              hint={`${(recurring?.share || 0).toFixed(1)}% del total · ${recurring?.count || 0} pagos`}
            />
            <KpiTile
              label="Variables"
              value={money(variable?.total || 0)}
              hint={`${(variable?.share || 0).toFixed(1)}% del total · ${variable?.count || 0} gastos`}
            />
            <KpiTile
              label="Promedio por día"
              value={money(summary!.dailyAverage)}
              hint={`Promedio por gasto: ${money(summary!.average)}`}
            />
          </div>

          {summary!.otherCurrency && (
            <p className="text-xs text-muted-foreground">
              En el mismo período también hay {summary!.otherCurrency.count} gasto(s) en{" "}
              {summary!.otherCurrency.currency} por{" "}
              {money(summary!.otherCurrency.total, summary!.otherCurrency.currency)}. No se suman
              acá: las monedas no se mezclan sin tipo de cambio real.
            </p>
          )}

          {/* Distribución por categoría */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribución por categoría</CardTitle>
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
                      data={report!.byCategory}
                      dataKey="total"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius="45%"
                      outerRadius="75%"
                      label={({ percent }: any) =>
                        percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ""
                      }
                      labelLine={false}
                    >
                      {report!.byCategory.map((slice) => (
                        <Cell key={slice.category} fill={slice.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Evolución {report!.bucketMode === "day" ? "diaria" : "mensual"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{}} className="h-[280px] w-full">
                  <BarChart data={report!.byBucket} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* Desglose por categoría */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desglose por categoría</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right w-[80px]">Cant.</TableHead>
                    <TableHead className="text-right w-[160px]">Total</TableHead>
                    <TableHead className="w-[200px]">% del total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report!.byCategory.map((slice) => (
                    <TableRow key={slice.category}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-sm shrink-0"
                            style={{ backgroundColor: slice.color }}
                            aria-hidden="true"
                          />
                          <span className="text-sm font-medium">{slice.category}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {slice.count}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(slice.total)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(slice.share, 1)}%`,
                                backgroundColor: slice.color,
                              }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground w-11 text-right">
                            {slice.share.toFixed(1)}%
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
                      {summary!.count}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {money(summary!.total)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">100%</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Composición por tipo y por cuenta */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por tipo de gasto</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report!.byType.map((row) => (
                  <div key={row.type} className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{row.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.count} movimiento{row.count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">{money(row.total)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {row.share.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por cuenta pagadora</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report!.byAccount.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin cuentas registradas.</p>
                ) : (
                  report!.byAccount.slice(0, 6).map((row) => (
                    <div key={row.account} className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{row.account}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.count} movimiento{row.count === 1 ? "" : "s"}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums shrink-0">
                        {money(row.total)}
                      </p>
                    </div>
                  ))
                )}
                {report!.byAccount.length > 6 && (
                  <p className="text-xs text-muted-foreground">
                    Se muestran las 6 cuentas con mayor gasto de {report!.byAccount.length}.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detalle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalle de gastos</CardTitle>
              <p className="text-sm text-muted-foreground">
                {detail.length} gasto{detail.length === 1 ? "" : "s"} en el período, del más
                reciente al más antiguo.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="w-[90px]">Tipo</TableHead>
                      <TableHead>Cuenta</TableHead>
                      <TableHead className="text-right w-[150px]">Importe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleDetail.map((row) => (
                      <TableRow key={`${row.type}-${row.id}`}>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatShortDate(row.date)}
                        </TableCell>
                        <TableCell className="font-medium">{row.description}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: row.categoryColor }}
                              aria-hidden="true"
                            />
                            <span className="text-sm">{row.category}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.type === "recurring" ? "Fijo" : "Variable"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.account}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {money(row.amount)}
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

function ExpensesReportSkeleton() {
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
