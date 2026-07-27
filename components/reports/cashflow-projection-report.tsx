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
import { Bar, BarChart, XAxis, YAxis } from "recharts"
import { AlertCircle, Download, Loader2, Plus, Wallet, X } from "lucide-react"
import { toast } from "sonner"

interface CashflowProjectionReportProps {
  agencies: Array<{ id: string; name: string }>
}

type Currency = "ARS" | "USD"
type Amounts = Record<Currency, number>

interface ReportBucket {
  key: string
  label: string
  receivable: Amounts
  receivableCount: Amounts
  payable: Amounts
  payableCount: Amounts
  net: Amounts
}

interface ReportPayload {
  filters: {
    agencyId: string | null
    agencyName: string | null
    tramos: number[]
    ownDataOnly: boolean
  }
  report: {
    today: string
    tramos: number[]
    buckets: ReportBucket[]
    balances: {
      byAccount: Array<{
        id: string
        name: string
        currency: string
        agencyName: string | null
        balance: number
      }>
      totals: Amounts
    }
    projection: Array<{
      bucketKey: string
      label: string
      opening: Amounts
      inflow: Amounts
      outflow: Amounts
      closing: Amounts
    }>
    summary: {
      overdueReceivable: Amounts
      overdueReceivableCount: Amounts
      overduePayable: Amounts
      overduePayableCount: Amounts
      totalReceivable: Amounts
      totalPayable: Amounts
      horizonNet: Amounts
      noDateReceivable: Amounts
      noDatePayable: Amounts
      firstShortfall: { ARS: string | null; USD: string | null }
      truncated: boolean
    }
    dueDateSource: {
      fromPaymentDeadline: number
      fromDepartureDate: number
      missing: number
    }
    receivables: Array<{
      operationId: string
      fileCode: string
      destination: string
      customerName: string
      sellerName: string
      debt: number
      currency: string
      dueDate: string | null
      dueDateSource: string
      bucketKey: string
      daysOverdue: number
    }>
    payables: Array<{
      id: string
      fileCode: string
      operatorName: string
      pending: number
      paidAmount: number
      currency: string
      dueDate: string | null
      bucketKey: string
      daysOverdue: number
    }>
  }
}

const DEFAULT_TRAMOS = [7, 15, 30]
const MAX_TRAMOS = 6
const OVERDUE_KEY = "OVERDUE"

export function CashflowProjectionReport({ agencies }: CashflowProjectionReportProps) {
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const [agencyId, setAgencyId] = useState("ALL")
  const [tramos, setTramos] = useState<number[]>(DEFAULT_TRAMOS)
  const [drafts, setDrafts] = useState<string[]>(DEFAULT_TRAMOS.map(String))

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ tramos: tramos.join(",") })
    if (agencyId !== "ALL") params.set("agencyId", agencyId)
    return params.toString()
  }, [tramos, agencyId])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/cashflow-projection?${queryString}`)
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
      const res = await fetch(`/api/reports/cashflow-projection/pdf?${queryString}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || "No se pudo generar el PDF")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `reporte-caja-${data?.report.today ?? "hoy"}.pdf`
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

  /** Los tramos se aplican al confirmar, no en cada tecla. */
  const commitDrafts = (next: string[]) => {
    const parsed = Array.from(
      new Set(
        next
          .map((v) => Math.floor(Number(v)))
          .filter((n) => Number.isFinite(n) && n > 0 && n <= 3650)
      )
    ).sort((a, b) => a - b)

    if (parsed.length === 0) {
      setDrafts(tramos.map(String))
      toast.error("Los tramos tienen que ser días positivos")
      return
    }
    setDrafts(parsed.map(String))
    if (parsed.join(",") !== tramos.join(",")) setTramos(parsed)
  }

  const applyPreset = (preset: number[]) => {
    setDrafts(preset.map(String))
    setTramos(preset)
  }

  const money = useCallback(
    (amount: number, currency: string) =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: currency === "USD" ? "USD" : "ARS",
        minimumFractionDigits: 2,
      }).format(amount || 0),
    []
  )

  const compact = useCallback((amount: number, currency: Currency) => {
    const symbol = currency === "USD" ? "US$" : "$"
    const abs = Math.abs(amount)
    if (abs >= 1_000_000) return `${symbol} ${(amount / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${symbol} ${Math.round(amount / 1_000)}k`
    return `${symbol} ${Math.round(amount)}`
  }, [])

  const report = data?.report
  const summary = report?.summary

  const currencies: Currency[] = useMemo(() => {
    if (!report) return []
    return (["ARS", "USD"] as Currency[]).filter(
      (c) =>
        report.summary.totalReceivable[c] !== 0 ||
        report.summary.totalPayable[c] !== 0 ||
        report.balances.totals[c] !== 0
    )
  }, [report])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Caja y flujo proyectado</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Saldo de hoy, lo vencido y lo que entra y sale en los próximos tramos. Pesos y
              dólares van por separado.
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
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>Tramos (días)</Label>
              <div className="flex flex-wrap items-center gap-2">
                {drafts.map((value, i) => (
                  <div key={i} className="relative">
                    <Input
                      type="number"
                      min={1}
                      max={3650}
                      value={value}
                      aria-label={`Tramo ${i + 1} en días`}
                      className="w-[92px] pr-7"
                      onChange={(e) => {
                        const next = [...drafts]
                        next[i] = e.target.value
                        setDrafts(next)
                      }}
                      onBlur={() => commitDrafts(drafts)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitDrafts(drafts)
                      }}
                    />
                    {drafts.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Quitar tramo de ${value} días`}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        onClick={() => commitDrafts(drafts.filter((_, idx) => idx !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {drafts.length < MAX_TRAMOS && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const last = Number(drafts[drafts.length - 1] || 0)
                      commitDrafts([...drafts, String(last > 0 ? last * 2 : 7)])
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Tramo
                  </Button>
                )}
              </div>
            </div>

            {agencies.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="cf-agency">Agencia</Label>
                <Select value={agencyId} onValueChange={setAgencyId}>
                  <SelectTrigger id="cf-agency" className="w-[200px]">
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
            <span className="text-xs text-muted-foreground">Atajos:</span>
            <Button variant="outline" size="sm" onClick={() => applyPreset([7, 15, 30])}>
              7 · 15 · 30
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset([15, 30, 60])}>
              15 · 30 · 60
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyPreset([30, 60, 90])}>
              30 · 60 · 90
            </Button>
          </div>

          {report && (
            <p className="text-xs text-muted-foreground">
              Saldos y vencimientos al {formatShortDate(report.today)}. Las cobranzas se derivan
              de la venta menos los cobros registrados, con el mismo criterio que la pantalla de
              Deudas.
            </p>
          )}
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
      ) : !report || currencies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-medium">Sin movimientos por cobrar ni por pagar</p>
              <p className="text-sm text-muted-foreground mt-1">
                No hay cobranzas pendientes, deuda con operadores ni saldo en cuentas con los
                filtros aplicados.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {summary!.truncated && (
            <p className="text-xs text-destructive">
              El tenant supera el máximo de filas leídas: los totales son parciales. Filtrá por
              agencia.
            </p>
          )}

          {currencies.map((currency) => {
            const shortfall = summary!.firstShortfall[currency]
            const shortfallPoint = report!.projection.find((p) => p.bucketKey === shortfall)
            const chartData = report!.projection.map((p) => ({
              label: p.label,
              cobrar: p.inflow[currency],
              pagar: p.outflow[currency],
            }))

            return (
              <div key={currency} className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">
                    {currency === "ARS" ? "Pesos (ARS)" : "Dólares (USD)"}
                  </h3>
                  <Badge variant="outline" className="font-normal">
                    no se mezcla con la otra moneda
                  </Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KpiTile
                    label="Saldo en cuentas hoy"
                    value={money(report!.balances.totals[currency], currency)}
                    hint={`${report!.balances.byAccount.filter((a) => a.currency === currency).length} cuenta(s)`}
                    emphasis
                  />
                  <KpiTile
                    label="Vencido a cobrar"
                    value={money(summary!.overdueReceivable[currency], currency)}
                    hint={`${summary!.overdueReceivableCount[currency]} operación(es)`}
                  />
                  <KpiTile
                    label="Vencido a pagar"
                    value={money(summary!.overduePayable[currency], currency)}
                    hint={`${summary!.overduePayableCount[currency]} pago(s)`}
                  />
                  <KpiTile
                    label="Neto del horizonte"
                    value={money(summary!.horizonNet[currency], currency)}
                    hint={
                      shortfall
                        ? `Saldo negativo en "${shortfallPoint?.label ?? shortfall}"`
                        : "Sin faltantes proyectados"
                    }
                  />
                </div>

                {shortfall && (
                  <p className="text-sm text-destructive">
                    Con este escenario el saldo en {currency} se vuelve negativo en el tramo
                    &quot;{shortfallPoint?.label ?? shortfall}&quot; (
                    {money(shortfallPoint?.closing[currency] ?? 0, currency)}).
                  </p>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Vencimientos por tramo</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tramo</TableHead>
                              <TableHead className="text-right">A cobrar</TableHead>
                              <TableHead className="text-right">A pagar</TableHead>
                              <TableHead className="text-right">Neto</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {report!.buckets.map((bucket) => (
                              <TableRow key={bucket.key}>
                                <TableCell
                                  className={
                                    bucket.key === OVERDUE_KEY
                                      ? "font-medium text-destructive"
                                      : "font-medium"
                                  }
                                >
                                  {bucket.label}
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    {bucket.receivableCount[currency]} /{" "}
                                    {bucket.payableCount[currency]}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-success">
                                  {money(bucket.receivable[currency], currency)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-destructive">
                                  {money(bucket.payable[currency], currency)}
                                </TableCell>
                                <TableCell
                                  className={`text-right font-medium tabular-nums ${
                                    bucket.net[currency] < 0 ? "text-destructive" : ""
                                  }`}
                                >
                                  {money(bucket.net[currency], currency)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <TableFooter>
                            <TableRow>
                              <TableCell className="font-semibold">Total</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {money(summary!.totalReceivable[currency], currency)}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {money(summary!.totalPayable[currency], currency)}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {money(
                                  summary!.totalReceivable[currency] -
                                    summary!.totalPayable[currency],
                                  currency
                                )}
                              </TableCell>
                            </TableRow>
                          </TableFooter>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">A cobrar y a pagar por tramo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={{}} className="h-[280px] w-full">
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            className="text-xs"
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            width={58}
                            tickFormatter={(value: number) => compact(value, currency)}
                            className="text-xs"
                          />
                          <ChartTooltip
                            cursor={false}
                            content={
                              <ChartTooltipContent
                                formatter={(value, name) => (
                                  <div className="flex items-center justify-between gap-3 w-full">
                                    <span className="text-muted-foreground">
                                      {name === "cobrar" ? "A cobrar" : "A pagar"}
                                    </span>
                                    <span className="font-medium tabular-nums">
                                      {money(Number(value), currency)}
                                    </span>
                                  </div>
                                )}
                              />
                            }
                          />
                          <Bar dataKey="cobrar" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                          <Bar
                            dataKey="pagar"
                            fill="hsl(var(--destructive))"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Proyección de caja</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Escenario: todo se cobra y se paga en su fecha de vencimiento. Lo que no
                      tiene fecha no participa.
                    </p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tramo</TableHead>
                            <TableHead className="text-right">Saldo inicial</TableHead>
                            <TableHead className="text-right">Ingresos</TableHead>
                            <TableHead className="text-right">Egresos</TableHead>
                            <TableHead className="text-right">Saldo final</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report!.projection.map((point) => (
                            <TableRow key={point.bucketKey}>
                              <TableCell className="font-medium">{point.label}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {money(point.opening[currency], currency)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-success">
                                {money(point.inflow[currency], currency)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-destructive">
                                {money(point.outflow[currency], currency)}
                              </TableCell>
                              <TableCell
                                className={`text-right font-medium tabular-nums ${
                                  point.closing[currency] < 0 ? "text-destructive" : ""
                                }`}
                              >
                                {money(point.closing[currency], currency)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saldos por cuenta</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Agencia</TableHead>
                      <TableHead>Moneda</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report!.balances.byAccount.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {account.agencyName || "Sin agencia"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{account.currency}</TableCell>
                        <TableCell
                          className={`text-right font-medium tabular-nums ${
                            account.balance < 0 ? "text-destructive" : ""
                          }`}
                        >
                          {money(account.balance, account.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <OverdueCard
              title="Cobranzas vencidas"
              emptyText="No hay cobranzas vencidas."
              rows={report!.receivables
                .filter((r) => r.bucketKey === OVERDUE_KEY)
                .slice(0, 25)
                .map((r) => ({
                  id: r.operationId,
                  primary: r.customerName,
                  secondary: `${r.fileCode} · ${r.destination} · venció ${formatShortDate(
                    r.dueDate || ""
                  )}`,
                  days: r.daysOverdue,
                  amount: money(r.debt, r.currency),
                }))}
              total={report!.receivables.filter((r) => r.bucketKey === OVERDUE_KEY).length}
            />
            <OverdueCard
              title="Pagos a operadores vencidos"
              emptyText="No hay pagos vencidos."
              rows={report!.payables
                .filter((p) => p.bucketKey === OVERDUE_KEY)
                .slice(0, 25)
                .map((p) => ({
                  id: p.id,
                  primary: p.operatorName,
                  secondary: `${p.fileCode} · venció ${formatShortDate(p.dueDate || "")}`,
                  days: p.daysOverdue,
                  amount: money(p.pending, p.currency),
                }))}
              total={report!.payables.filter((p) => p.bucketKey === OVERDUE_KEY).length}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Criterios del reporte</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Las cobranzas no existen como comprobantes pendientes: se derivan de la venta
                menos los cobros ya registrados, con la misma fórmula que la pantalla de Deudas.
              </p>
              <p>
                Vencimiento de la cobranza: fecha límite de pago cargada en la operación en{" "}
                {report!.dueDateSource.fromPaymentDeadline} caso(s), fecha de salida del viaje en{" "}
                {report!.dueDateSource.fromDepartureDate}, y sin ninguna de las dos en{" "}
                {report!.dueDateSource.missing} (van al tramo &quot;Sin fecha&quot; y quedan
                fuera de la proyección).
              </p>
              {(summary!.noDateReceivable.ARS !== 0 ||
                summary!.noDateReceivable.USD !== 0) && (
                <p>
                  Sin fecha de vencimiento hay{" "}
                  {money(summary!.noDateReceivable.ARS, "ARS")} y{" "}
                  {money(summary!.noDateReceivable.USD, "USD")} por cobrar.
                </p>
              )}
              <p>
                La proyección es un escenario, no una promesa: asume que todo se cobra y se paga
                el día que vence.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function OverdueCard({
  title,
  emptyText,
  rows,
  total,
}: {
  title: string
  emptyText: string
  rows: Array<{ id: string; primary: string; secondary: string; days: number; amount: string }>
  total: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {total > rows.length && (
          <p className="text-sm text-muted-foreground">
            Se muestran las {rows.length} más atrasadas de {total}.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{row.primary}</p>
                <p className="text-xs text-muted-foreground truncate">{row.secondary}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold tabular-nums">{row.amount}</p>
                <p className="text-xs text-destructive tabular-nums">{row.days} días</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
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
        <Skeleton className="h-[320px] w-full" />
        <Skeleton className="h-[320px] w-full" />
      </div>
      <Skeleton className="h-[240px] w-full" />
    </div>
  )
}

/** "2026-07-14" -> "14/07/2026" sin pasar por Date (evita corrimiento UTC). */
function formatShortDate(dateKey: string): string {
  if (!dateKey || dateKey.length < 10) return "-"
  const [y, m, d] = dateKey.split("-")
  return `${d}/${m}/${y}`
}
