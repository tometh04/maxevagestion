"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import Link from "next/link"
import { format } from "date-fns"
import {
  FileText, TrendingUp, CheckCircle2, XCircle, Clock, Send, ArrowRight,
  RefreshCw, BarChart3, MapPin, Users, DollarSign, Percent, AlertTriangle,
  Eye, Loader2, Briefcase, Download
} from "lucide-react"
import { downloadQuotationPDF } from "@/lib/pdf/quotation-pdf"

interface QuotationsDashboardProps {
  sellers: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
  currentUserRole: string
  currentUserId: string
}

interface SummaryData {
  total: number
  conversionRate: number
  totalAmountUSD: number
  totalAmountARS: number
  approvedAmountUSD: number
  approvedAmountARS: number
  drafts: number
  sent: number
  approved: number
  rejected: number
  expired: number
}

interface SellerStat {
  name: string
  total: number
  sent: number
  approved: number
  converted: number
}

interface DestinationStat {
  destination: string
  count: number
}

interface MonthlyTrend {
  month: string
  total: number
  approved: number
  rate: number
}

interface RegionStat {
  region: string
  count: number
}

function formatCurrency(amount: number, currency: string) {
  const prefix = currency === "USD" ? "US$" : "$"
  return `${prefix} ${Number(amount).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const MONTH_NAMES: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr", "05": "May", "06": "Jun",
  "07": "Jul", "08": "Ago", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
}

const REGION_COLORS: Record<string, string> = {
  ARGENTINA: "bg-info",
  CARIBE: "bg-cyan-500",
  BRASIL: "bg-success",
  EUROPA: "bg-purple-500",
  EEUU: "bg-destructive",
  OTROS: "bg-gray-400",
  CRUCEROS: "bg-primary",
}

export function QuotationsDashboard({ sellers, agencies, currentUserRole, currentUserId }: QuotationsDashboardProps) {
  const [loading, setLoading] = useState(true)
  const [sellerId, setSellerId] = useState("ALL")
  const [agencyId, setAgencyId] = useState("ALL")
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [topDestinations, setTopDestinations] = useState<DestinationStat[]>([])
  const [sellerStats, setSellerStats] = useState<SellerStat[]>([])
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrend[]>([])
  const [regionStats, setRegionStats] = useState<RegionStat[]>([])
  const [quotationsList, setQuotationsList] = useState<any[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [selectedQuotation, setSelectedQuotation] = useState<any>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const isSeller = currentUserRole === "SELLER"

  const fetchQuotationsList = useCallback(async () => {
    setLoadingList(true)
    try {
      const params = new URLSearchParams()
      if (sellerId !== "ALL") params.set("seller_id", sellerId)
      if (agencyId !== "ALL") params.set("agency_id", agencyId)
      params.set("limit", "100")

      const res = await fetch(`/api/quotations?${params}`, { cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        setQuotationsList(json.data || [])
      }
    } catch (err) {
      console.error("Error fetching quotations list:", err)
    } finally {
      setLoadingList(false)
    }
  }, [sellerId, agencyId])

  const handleConvert = async () => {
    if (!selectedQuotation) return
    setConvertingId(selectedQuotation.id)
    try {
      const res = await fetch(`/api/quotations/${selectedQuotation.id}/convert`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "Error al convertir")
        return
      }
      toast.success(`Operacion ${json.data.file_code} creada con ${json.data.services_created} servicios`)
      fetchData()
      fetchQuotationsList()
    } catch (err) {
      toast.error("Error al convertir cotizacion")
    } finally {
      setConvertingId(null)
      setConvertDialogOpen(false)
      setSelectedQuotation(null)
    }
  }

  const handleDownloadPDF = async (quotation: any) => {
    setDownloadingId(quotation.id)
    try {
      // Fetch full quotation data for PDF
      const res = await fetch(`/api/quotations/${quotation.id}`)
      if (!res.ok) throw new Error("Error fetching quotation")
      const json = await res.json()
      const q = json.data

      // Fetch branding
      const brandRes = await fetch("/api/public/branding")
      const brandJson = brandRes.ok ? await brandRes.json() : { data: {} }

      const pdfData = {
        quotation_number: q.quotation_number,
        destination: q.destination,
        origin: q.origin,
        departure_date: q.departure_date,
        return_date: q.return_date,
        valid_until: q.valid_until,
        adults: q.adults,
        children: q.children,
        infants: q.infants,
        currency: q.currency,
        status: q.status,
        notes: q.notes,
        terms_and_conditions: q.terms_and_conditions,
        created_at: q.created_at,
        seller_name: q.seller?.name || "Vendedor",
        agency_name: q.agency?.name || "Agencia",
        options: (q.quotation_options || []).map((opt: any) => ({
          ...opt,
          items: (q.quotation_items || []).filter((item: any) => item.option_id === opt.id),
        })),
      }

      await downloadQuotationPDF(pdfData, brandJson.data || {})
    } catch (err) {
      console.error("Error downloading PDF:", err)
      toast.error("Error al descargar PDF")
    } finally {
      setDownloadingId(null)
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (sellerId !== "ALL") params.set("sellerId", sellerId)
      if (agencyId !== "ALL") params.set("agencyId", agencyId)

      const res = await fetch(`/api/analytics/quotations?${params}`, { cache: "no-store" })
      if (!res.ok) throw new Error("Error fetching data")

      const json = await res.json()
      const d = json.data

      setSummary(d.summary)
      setTopDestinations(d.topDestinations)
      setSellerStats(d.sellerStats)
      setMonthlyTrend(d.monthlyTrend)
      setRegionStats(d.regionStats)
    } catch (err) {
      console.error("Error loading quotation analytics:", err)
    } finally {
      setLoading(false)
    }
  }, [sellerId, agencyId])

  useEffect(() => {
    fetchData()
    fetchQuotationsList()
  }, [fetchData, fetchQuotationsList])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Metricas de Cotizaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Rendimiento y conversion de cotizaciones</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Filters */}
      {!isSeller && (
        <div className="flex gap-3 flex-wrap">
          <Select value={sellerId} onValueChange={setSellerId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los vendedores</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agencyId} onValueChange={setAgencyId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Agencia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las agencias</SelectItem>
              {agencies.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-20" />
            </Card>
          ))
        ) : summary ? (
          <>
            <Card className="p-5">
              <div className="flex items-center gap-1 mb-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">Total Cotizaciones</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums">{summary.total}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.drafts} borradores, {summary.sent} enviadas
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-1 mb-3">
                <Percent className="h-4 w-4 text-success" />
                <p className="text-sm font-medium text-muted-foreground">Tasa de Conversion</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums">{summary.conversionRate}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.approved} aprobadas de {summary.approved + summary.rejected + summary.expired + summary.sent} enviadas
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-1 mb-3">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <p className="text-sm font-medium text-muted-foreground">Aprobadas</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums">{summary.approved}</p>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                {summary.approvedAmountUSD > 0 && <p>{formatCurrency(summary.approvedAmountUSD, "USD")}</p>}
                {summary.approvedAmountARS > 0 && <p>{formatCurrency(summary.approvedAmountARS, "ARS")}</p>}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-1 mb-3">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <p className="text-sm font-medium text-muted-foreground">Perdidas</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums">{summary.rejected + summary.expired}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {summary.rejected} rechazadas, {summary.expired} vencidas
              </p>
            </Card>
          </>
        ) : null}
      </div>

      {/* Status breakdown */}
      {!loading && summary && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4">Funnel de Cotizaciones</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: "Borrador", count: summary.drafts, color: "bg-muted text-muted-foreground", icon: FileText },
              { label: "Enviadas", count: summary.sent, color: "bg-info/10 text-info", icon: Send },
              { label: "Aprobadas", count: summary.approved, color: "bg-success/10 text-success", icon: CheckCircle2 },
              { label: "Rechazadas", count: summary.rejected, color: "bg-destructive/10 text-destructive", icon: XCircle },
              { label: "Vencidas", count: summary.expired, color: "bg-warning/10 text-warning", icon: Clock },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 flex-1 min-w-[140px]">
                <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums">{s.count}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
                {s.label !== "Vencidas" && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground/30 ml-auto" />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monthly trend */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Tendencia Mensual
          </h3>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : monthlyTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {monthlyTrend.map((m) => {
                const maxTotal = Math.max(...monthlyTrend.map((t) => t.total))
                const barWidth = maxTotal > 0 ? (m.total / maxTotal) * 100 : 0
                const approvedWidth = maxTotal > 0 ? (m.approved / maxTotal) * 100 : 0
                const monthLabel = MONTH_NAMES[m.month.split("-")[1]] || m.month

                return (
                  <div key={m.month}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium w-10">{monthLabel}</span>
                      <span className="text-xs text-muted-foreground">
                        {m.total} total · {m.approved} aprobadas · {m.rate}%
                      </span>
                    </div>
                    <div className="relative h-6 bg-muted/50 rounded-md overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/20 rounded-md transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 bg-success/60 rounded-md transition-all"
                        style={{ width: `${approvedWidth}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-primary/20" /> Total
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-success/60" /> Aprobadas
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Seller performance */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Rendimiento por Vendedor
          </h3>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : sellerStats.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {sellerStats.map((s, idx) => {
                const rate = s.total > 0 ? Math.round((s.approved / s.total) * 100) : 0
                return (
                  <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.total} cotizaciones · {s.approved} aprobadas
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${rate >= 50 ? "bg-success/10 text-success" : rate >= 25 ? "bg-warning/10 text-warning" : "bg-muted"}`}
                    >
                      {rate}%
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Top Destinations */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Top Destinos Cotizados
          </h3>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : topDestinations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {topDestinations.map((d, idx) => {
                const maxCount = topDestinations[0]?.count || 1
                const barWidth = (d.count / maxCount) * 100
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-sm truncate">{d.destination}</p>
                        <span className="text-xs font-medium tabular-nums ml-2">{d.count}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/40 rounded-full transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Regions */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Cotizaciones por Region
          </h3>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : regionStats.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {regionStats.map((r) => {
                const total = regionStats.reduce((sum, x) => sum + x.count, 0)
                const pct = total > 0 ? Math.round((r.count / total) * 100) : 0
                const colorClass = REGION_COLORS[r.region] || "bg-gray-400"
                return (
                  <div key={r.region} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colorClass}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{r.region}</span>
                        <span className="text-xs text-muted-foreground">{r.count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full rounded-full ${colorClass}`}
                          style={{ width: `${pct}%`, opacity: 0.6 }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Quotations List Table */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Listado de Cotizaciones
        </h3>
        {loadingList ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : quotationsList.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No hay cotizaciones</p>
        ) : (
          <div className="rounded-xl border border-border/40">
            <div className="max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/50 z-10">
                  <TableRow>
                    <TableHead className="text-xs">Numero</TableHead>
                    <TableHead className="text-xs">Lead</TableHead>
                    <TableHead className="text-xs">Destino</TableHead>
                    <TableHead className="text-xs">Vendedor</TableHead>
                    <TableHead className="text-xs">Monto</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotationsList.map((q) => {
                    const statusConfig: Record<string, { label: string; color: string }> = {
                      DRAFT: { label: "Borrador", color: "bg-muted text-muted-foreground" },
                      SENT: { label: "Enviada", color: "bg-info/10 text-info" },
                      APPROVED: { label: "Aprobada", color: "bg-success/10 text-success" },
                      REJECTED: { label: "Rechazada", color: "bg-destructive/10 text-destructive" },
                      EXPIRED: { label: "Vencida", color: "bg-warning/10 text-warning" },
                      CONVERTED: { label: "Convertida", color: "bg-primary/10 text-primary" },
                    }
                    const sc = statusConfig[q.status] || statusConfig.DRAFT
                    const canConvert = q.status === "APPROVED"

                    return (
                      <TableRow key={q.id}>
                        <TableCell className="text-xs font-medium">{q.quotation_number}</TableCell>
                        <TableCell className="text-xs">
                          {q.lead?.contact_name || "-"}
                        </TableCell>
                        <TableCell className="text-xs">{q.destination}</TableCell>
                        <TableCell className="text-xs">{q.seller?.name || "-"}</TableCell>
                        <TableCell className="text-xs font-medium tabular-nums">
                          {formatCurrency(q.total_amount, q.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${sc.color}`}>
                            {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(q.created_at), "dd/MM/yy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {q.public_token && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => window.open(`/cotizacion/${q.public_token}`, "_blank")}
                                title="Ver cotizacion publica"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => handleDownloadPDF(q)}
                              disabled={downloadingId === q.id}
                              title="Descargar PDF"
                            >
                              {downloadingId === q.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            {canConvert && (
                              <Button
                                variant="default"
                                size="sm"
                                className="h-7 text-xs bg-success hover:bg-success/90"
                                onClick={() => {
                                  setSelectedQuotation(q)
                                  setConvertDialogOpen(true)
                                }}
                                disabled={convertingId === q.id}
                              >
                                {convertingId === q.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                ) : (
                                  <Briefcase className="h-3.5 w-3.5 mr-1" />
                                )}
                                Convertir
                              </Button>
                            )}
                            {q.status === "CONVERTED" && q.operation_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                asChild
                              >
                                <Link href={`/operations/${q.operation_id}`}>
                                  <Briefcase className="h-3.5 w-3.5 mr-1" />
                                  Operacion
                                </Link>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>

      {/* Convert confirmation dialog */}
      <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convertir cotizacion a operacion</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedQuotation && (
                <>
                  Se creara una operacion a partir de la cotizacion{" "}
                  <strong>{selectedQuotation.quotation_number}</strong> por{" "}
                  <strong>{formatCurrency(selectedQuotation.total_amount, selectedQuotation.currency)}</strong>.
                  <br /><br />
                  Esto creara la operacion con todos los servicios, vinculara al cliente del lead,
                  y marcara el lead como ganado. Esta accion no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!convertingId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConvert}
              disabled={!!convertingId}
              className="bg-success hover:bg-success/90"
            >
              {convertingId ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Convirtiendo...
                </>
              ) : (
                <>
                  <Briefcase className="h-4 w-4 mr-2" />
                  Convertir
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
