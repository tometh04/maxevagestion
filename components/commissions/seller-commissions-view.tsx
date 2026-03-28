"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { formatCurrency, type Currency } from "@/lib/currency"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import {
  Wallet,
  History,
  Clock,
  CheckCircle2,
  CalendarDays,
  Receipt,
  Inbox,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Commission {
  id: string
  operation_id: string
  amount: number
  percentage: number | null
  status: "PENDING" | "PAID"
  date_calculated: string
  date_paid: string | null
  operation?: {
    id: string
    destination: string | null
    departure_date: string | null
    file_code: string | null
    short_code: string | null
    margin_amount: number | null
    currency: string | null
    sale_amount_total: number | null
    operator_cost: number | null
  } | null
}

interface SellerCommissionsViewProps {
  userId: string
  userRole: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(amount: number, currency?: string | null): string {
  const cur = (currency || "ARS") as Currency
  return formatCurrency(amount, cur)
}

function operationLabel(op: Commission["operation"]): string {
  if (!op) return "-"
  return op.file_code || op.short_code || "-"
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-")
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
}

function generateMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const today = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    options.push({ value: monthKey(d), label: monthLabel(monthKey(d)) })
  }
  return options
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SellerCommissionsView({ userId }: SellerCommissionsViewProps) {
  // ---- state ----
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)

  // Tab 1 filters
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [monthFilterBalance, setMonthFilterBalance] = useState("ALL")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // Tab 2 filters
  const [monthFilterHistory, setMonthFilterHistory] = useState("ALL")
  const [histDateFrom, setHistDateFrom] = useState("")
  const [histDateTo, setHistDateTo] = useState("")

  const monthOptions = useMemo(() => generateMonthOptions(), [])

  // ---- fetch ----
  const fetchCommissions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ sellerId: userId })
      const res = await fetch(`/api/commissions?${params.toString()}`)
      const data = await res.json()
      setCommissions(data.commissions || [])
    } catch (err) {
      console.error("Error fetching commissions:", err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchCommissions()
  }, [fetchCommissions])

  // ---- derived data for Tab 1 (Mi Balance) ----
  const filteredCommissions = useMemo(() => {
    let result = [...commissions]

    // status
    if (statusFilter !== "ALL") {
      result = result.filter((c) => c.status === statusFilter)
    }

    // month
    if (monthFilterBalance !== "ALL") {
      result = result.filter((c) => {
        const d = new Date(c.date_calculated)
        return monthKey(d) === monthFilterBalance
      })
    }

    // date range
    if (dateFrom) {
      const from = new Date(dateFrom)
      result = result.filter((c) => new Date(c.date_calculated) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter((c) => new Date(c.date_calculated) <= to)
    }

    // sort by date desc
    result.sort(
      (a, b) =>
        new Date(b.date_calculated).getTime() -
        new Date(a.date_calculated).getTime()
    )

    return result
  }, [commissions, statusFilter, monthFilterBalance, dateFrom, dateTo])

  const pendingTotal = useMemo(
    () =>
      commissions
        .filter((c) => c.status === "PENDING")
        .reduce((s, c) => s + c.amount, 0),
    [commissions]
  )

  const paidTotal = useMemo(
    () =>
      commissions
        .filter((c) => c.status === "PAID")
        .reduce((s, c) => s + c.amount, 0),
    [commissions]
  )

  const currentMonthTotal = useMemo(() => {
    const now = new Date()
    const key = monthKey(now)
    return commissions
      .filter((c) => monthKey(new Date(c.date_calculated)) === key)
      .reduce((s, c) => s + c.amount, 0)
  }, [commissions])

  // ---- derived data for Tab 2 (Historial de Pagos) ----
  const paidCommissions = useMemo(() => {
    let result = commissions.filter((c) => c.status === "PAID")

    if (monthFilterHistory !== "ALL") {
      result = result.filter((c) => {
        if (!c.date_paid) return false
        return monthKey(new Date(c.date_paid)) === monthFilterHistory
      })
    }

    if (histDateFrom) {
      const from = new Date(histDateFrom)
      result = result.filter(
        (c) => c.date_paid && new Date(c.date_paid) >= from
      )
    }
    if (histDateTo) {
      const to = new Date(histDateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter(
        (c) => c.date_paid && new Date(c.date_paid) <= to
      )
    }

    result.sort(
      (a, b) =>
        new Date(b.date_paid || b.date_calculated).getTime() -
        new Date(a.date_paid || a.date_calculated).getTime()
    )

    return result
  }, [commissions, monthFilterHistory, histDateFrom, histDateTo])

  const paidPeriodTotal = useMemo(
    () => paidCommissions.reduce((s, c) => s + c.amount, 0),
    [paidCommissions]
  )

  const paidGroupedByMonth = useMemo(() => {
    const groups: Record<string, Commission[]> = {}
    for (const c of paidCommissions) {
      const key = c.date_paid
        ? monthKey(new Date(c.date_paid))
        : monthKey(new Date(c.date_calculated))
      if (!groups[key]) groups[key] = []
      groups[key].push(c)
    }
    // sort keys descending
    const sorted = Object.entries(groups).sort(([a], [b]) => b.localeCompare(a))
    return sorted
  }, [paidCommissions])

  // ---- loading skeleton ----
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border/40 p-5 space-y-2"
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-32" />
            </div>
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  // ---- render ----
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Mis Comisiones
      </h1>

      <Tabs defaultValue="balance" className="w-full">
        <TabsList>
          <TabsTrigger value="balance">Mi Balance</TabsTrigger>
          <TabsTrigger value="history">Historial de Pagos</TabsTrigger>
        </TabsList>

        {/* ============================================================= */}
        {/* TAB 1 — Mi Balance                                            */}
        {/* ============================================================= */}
        <TabsContent value="balance" className="space-y-6 mt-4">
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Pending */}
            <div className="rounded-xl border border-border/40 p-5 space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                <p className="text-xs font-medium text-muted-foreground">
                  Balance Pendiente
                </p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight text-warning">
                {fmtCurrency(pendingTotal)}
              </p>
            </div>

            {/* Paid historic */}
            <div className="rounded-xl border border-border/40 p-5 space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <p className="text-xs font-medium text-muted-foreground">
                  Total Cobrado (historico)
                </p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight text-success">
                {fmtCurrency(paidTotal)}
              </p>
            </div>

            {/* This month */}
            <div className="rounded-xl border border-border/40 p-5 space-y-1">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium text-muted-foreground">
                  Comisiones este mes
                </p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {fmtCurrency(currentMonthTotal)}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                <SelectItem value="PENDING">Pendientes</SelectItem>
                <SelectItem value="PAID">Pagadas</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={monthFilterBalance}
              onValueChange={setMonthFilterBalance}
            >
              <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
                <SelectValue placeholder="Mes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los meses</SelectItem>
                {monthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="Desde"
              className="h-8 text-xs rounded-full border-border/60 bg-background w-[140px]"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="Hasta"
              className="h-8 text-xs rounded-full border-border/60 bg-background w-[140px]"
            />
          </div>

          {/* Table */}
          {filteredCommissions.length === 0 ? (
            <div className="rounded-xl border border-border/40 p-12 flex flex-col items-center justify-center text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-muted/50 mb-4">
                <Inbox className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="font-medium text-foreground/70">
                No hay comisiones
              </p>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                No se encontraron comisiones con los filtros seleccionados.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Operacion</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Fecha Salida</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                    <TableHead className="text-right">% Comision</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCommissions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/operations/${c.operation_id}`}
                          className="text-primary hover:underline"
                        >
                          {operationLabel(c.operation)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {c.operation?.destination || "-"}
                      </TableCell>
                      <TableCell>
                        {c.operation?.departure_date
                          ? format(
                              new Date(c.operation.departure_date),
                              "dd/MM/yyyy",
                              { locale: es }
                            )
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.operation?.margin_amount != null
                          ? fmtCurrency(
                              c.operation.margin_amount,
                              c.operation.currency
                            )
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.percentage != null
                          ? `${c.percentage.toFixed(1)}%`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmtCurrency(c.amount, c.operation?.currency)}
                      </TableCell>
                      <TableCell>
                        {c.status === "PAID" ? (
                          <Badge variant="success">Pagada</Badge>
                        ) : (
                          <Badge variant="warning">Pendiente</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ============================================================= */}
        {/* TAB 2 — Historial de Pagos                                    */}
        {/* ============================================================= */}
        <TabsContent value="history" className="space-y-6 mt-4">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={monthFilterHistory}
              onValueChange={setMonthFilterHistory}
            >
              <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
                <SelectValue placeholder="Mes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los meses</SelectItem>
                {monthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={histDateFrom}
              onChange={(e) => setHistDateFrom(e.target.value)}
              placeholder="Desde"
              className="h-8 text-xs rounded-full border-border/60 bg-background w-[140px]"
            />
            <Input
              type="date"
              value={histDateTo}
              onChange={(e) => setHistDateTo(e.target.value)}
              placeholder="Hasta"
              className="h-8 text-xs rounded-full border-border/60 bg-background w-[140px]"
            />
          </div>

          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border/40 p-5 space-y-1">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-success" />
                <p className="text-xs font-medium text-muted-foreground">
                  Total Cobrado (periodo)
                </p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight text-success">
                {fmtCurrency(paidPeriodTotal)}
              </p>
            </div>

            <div className="rounded-xl border border-border/40 p-5 space-y-1">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium text-muted-foreground">
                  Cantidad de Pagos
                </p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {paidCommissions.length}
              </p>
            </div>
          </div>

          {/* Grouped table */}
          {paidCommissions.length === 0 ? (
            <div className="rounded-xl border border-border/40 p-12 flex flex-col items-center justify-center text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-muted/50 mb-4">
                <History className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="font-medium text-foreground/70">
                Sin pagos registrados
              </p>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                Aun no se registraron pagos de comisiones.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {paidGroupedByMonth.map(([key, items]) => {
                const subtotal = items.reduce((s, c) => s + c.amount, 0)
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4"
                  >
                    {/* Month header */}
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium capitalize">
                        {monthLabel(key)}
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-success">
                        {fmtCurrency(subtotal)}
                      </p>
                    </div>

                    {/* Table for this month */}
                    <div className="rounded-xl border border-border/40 max-h-[60vh] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background z-10">
                          <TableRow>
                            <TableHead>Fecha Pago</TableHead>
                            <TableHead>Operacion</TableHead>
                            <TableHead>Destino</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead className="text-right">%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell>
                                {c.date_paid
                                  ? format(
                                      new Date(c.date_paid),
                                      "dd/MM/yyyy",
                                      { locale: es }
                                    )
                                  : "-"}
                              </TableCell>
                              <TableCell className="font-medium">
                                <Link
                                  href={`/operations/${c.operation_id}`}
                                  className="text-primary hover:underline"
                                >
                                  {operationLabel(c.operation)}
                                </Link>
                              </TableCell>
                              <TableCell>
                                {c.operation?.destination || "-"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {fmtCurrency(c.amount, c.operation?.currency)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {c.percentage != null
                                  ? `${c.percentage.toFixed(1)}%`
                                  : "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
