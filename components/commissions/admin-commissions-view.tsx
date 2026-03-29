"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { CommissionsSettings } from "@/components/settings/commissions-settings"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  DollarSign,
  Users,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Clock,
  History,
  Settings2,
  Loader2,
  Receipt,
  AlertTriangle,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Commission {
  id: string
  operation_id: string
  seller_id: string
  agency_id: string | null
  amount: number
  amount_paid?: number
  percentage: number | null
  status: "PENDING" | "PAID"
  date_calculated: string
  date_paid: string | null
  operation?: {
    id: string
    short_code?: string
    file_code?: string
    destination: string
    departure_date: string
    sale_amount_total: number
    operator_cost?: number
    margin_amount: number
    currency: string
    sale_currency?: string
  } | null
  sellers?: {
    id: string
    name: string
  } | null
}

interface SellerGroup {
  sellerId: string
  sellerName: string
  commissions: Commission[]
  totalPending: number
  totalPendingUSD: number
  totalPendingARS: number
  count: number
}

interface FinancialAccount {
  id: string
  name: string
  currency: string
  type: string
  current_balance?: number
  agencies?: { id: string; name: string } | null
}

interface AdminCommissionsViewProps {
  userId: string
  userRole: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtCurrency = (value: number, currency = "USD") =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value)

const getCommCurrency = (c: Commission): string =>
  c.operation?.currency || c.operation?.sale_currency || "USD"

function generateMonthOptions() {
  const options: { value: string; label: string }[] = []
  const today = new Date()
  for (let i = 0; i < 12; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    const label = date.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
    options.push({ value, label })
  }
  return options
}

/** Calcula totales separados por moneda */
function calcTotalsByCurrency(commissions: Commission[]): { usd: number; ars: number } {
  let usd = 0
  let ars = 0
  for (const c of commissions) {
    const cur = getCommCurrency(c)
    if (cur === "ARS") ars += c.amount
    else usd += c.amount
  }
  return { usd, ars }
}

/** Calcula remaining por comisión */
function getRemaining(c: Commission): number {
  return c.amount - (c.amount_paid || 0)
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AdminCommissionsView({ userId, userRole }: AdminCommissionsViewProps) {
  const { toast } = useToast()
  const monthOptions = useMemo(() => generateMonthOptions(), [])

  // ── Shared state ──
  const [activeTab, setActiveTab] = useState("por-pagar")

  // ── Por Pagar state ──
  const [pendingCommissions, setPendingCommissions] = useState<Commission[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingMonth, setPendingMonth] = useState("ALL")
  const [pendingDateFrom, setPendingDateFrom] = useState("")
  const [pendingDateTo, setPendingDateTo] = useState("")
  const [expandedSellers, setExpandedSellers] = useState<Set<string>>(new Set())
  const [paidThisMonthUSD, setPaidThisMonthUSD] = useState(0)
  const [paidThisMonthARS, setPaidThisMonthARS] = useState(0)

  // ── Historial state ──
  const [paidCommissions, setPaidCommissions] = useState<Commission[]>([])
  const { sortedData: sortedPaidCommissions, sortConfig: paidSortConfig, requestSort: requestPaidSort } = useSortableData(paidCommissions, {
    key: "date_paid",
    direction: "desc",
  })
  const [paidLoading, setPaidLoading] = useState(false)
  const [paidMonth, setPaidMonth] = useState("ALL")
  const [paidDateFrom, setPaidDateFrom] = useState("")
  const [paidDateTo, setPaidDateTo] = useState("")
  const [paidSellerFilter, setPaidSellerFilter] = useState("ALL")

  // ── Pay dialog state ──
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingSeller, setPayingSeller] = useState<SellerGroup | null>(null)
  const [selectedCommissionIds, setSelectedCommissionIds] = useState<Set<string>>(new Set())
  const [payAmounts, setPayAmounts] = useState<Record<string, number>>({})
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  const [payAccountId, setPayAccountId] = useState("")
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split("T")[0])
  const [payNotes, setPayNotes] = useState("")
  const [paySubmitting, setPaySubmitting] = useState(false)

  // ── Fetch pending commissions ──
  const fetchPendingCommissions = useCallback(async () => {
    setPendingLoading(true)
    try {
      const params = new URLSearchParams({ status: "PENDING" })
      if (pendingMonth !== "ALL") params.set("month", pendingMonth)
      if (pendingDateFrom) params.set("periodStart", pendingDateFrom)
      if (pendingDateTo) params.set("periodEnd", pendingDateTo)

      const res = await fetch(`/api/commissions?${params.toString()}`)
      const data = await res.json()
      setPendingCommissions(data.commissions || [])
    } catch (err) {
      console.error("Error fetching pending commissions:", err)
    } finally {
      setPendingLoading(false)
    }
  }, [pendingMonth, pendingDateFrom, pendingDateTo])

  // ── Fetch paid commissions ──
  const fetchPaidCommissions = useCallback(async () => {
    setPaidLoading(true)
    try {
      const params = new URLSearchParams({ status: "PAID" })
      if (paidMonth !== "ALL") params.set("month", paidMonth)
      if (paidDateFrom) params.set("periodStart", paidDateFrom)
      if (paidDateTo) params.set("periodEnd", paidDateTo)
      if (paidSellerFilter !== "ALL") params.set("sellerId", paidSellerFilter)

      const res = await fetch(`/api/commissions?${params.toString()}`)
      const data = await res.json()
      setPaidCommissions(data.commissions || [])
    } catch (err) {
      console.error("Error fetching paid commissions:", err)
    } finally {
      setPaidLoading(false)
    }
  }, [paidMonth, paidDateFrom, paidDateTo, paidSellerFilter])

  // ── Fetch paid-this-month total (separated by currency) ──
  const fetchPaidThisMonth = useCallback(async () => {
    try {
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      const params = new URLSearchParams({ status: "PAID", month: currentMonth })
      const res = await fetch(`/api/commissions?${params.toString()}`)
      const data = await res.json()
      const totals = calcTotalsByCurrency(data.commissions || [])
      setPaidThisMonthUSD(totals.usd)
      setPaidThisMonthARS(totals.ars)
    } catch {
      // silent
    }
  }, [])

  // ── Fetch financial accounts ──
  const fetchFinancialAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounting/financial-accounts?excludeAccountingOnly=true")
      const data = await res.json()
      setFinancialAccounts(data.accounts || [])
    } catch (err) {
      console.error("Error fetching financial accounts:", err)
    }
  }, [])

  // ── Effects ──
  useEffect(() => {
    fetchPendingCommissions()
    fetchPaidThisMonth()
  }, [fetchPendingCommissions, fetchPaidThisMonth])

  useEffect(() => {
    if (activeTab === "historial") {
      fetchPaidCommissions()
    }
  }, [activeTab, fetchPaidCommissions])

  // ── Group pending by seller (with per-currency totals) ──
  const sellerGroups = useMemo((): SellerGroup[] => {
    const map = new Map<string, SellerGroup>()
    for (const c of pendingCommissions) {
      const sid = c.seller_id
      const sname = c.sellers?.name || "Vendedor desconocido"
      if (!map.has(sid)) {
        map.set(sid, {
          sellerId: sid,
          sellerName: sname,
          commissions: [],
          totalPending: 0,
          totalPendingUSD: 0,
          totalPendingARS: 0,
          count: 0,
        })
      }
      const group = map.get(sid)!
      group.commissions.push(c)
      group.totalPending += c.amount
      const cur = getCommCurrency(c)
      if (cur === "ARS") group.totalPendingARS += c.amount
      else group.totalPendingUSD += c.amount
      group.count += 1
    }
    return Array.from(map.values()).sort((a, b) => b.totalPending - a.totalPending)
  }, [pendingCommissions])

  // ── KPI for pending tab (separated by currency) ──
  const pendingTotals = useMemo(
    () => calcTotalsByCurrency(pendingCommissions),
    [pendingCommissions]
  )
  const sellersWithPending = sellerGroups.length

  // ── KPI for paid tab (separated by currency) ──
  const paidTotals = useMemo(
    () => calcTotalsByCurrency(paidCommissions),
    [paidCommissions]
  )
  const paidCount = paidCommissions.length

  // ── Unique sellers from paid list (for filter) ──
  const paidSellers = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of paidCommissions) {
      if (!seen.has(c.seller_id)) {
        seen.set(c.seller_id, c.sellers?.name || "Vendedor desconocido")
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [paidCommissions])

  // ── Expand / collapse seller rows ──
  const toggleSeller = (sellerId: string) => {
    setExpandedSellers((prev) => {
      const next = new Set(prev)
      if (next.has(sellerId)) next.delete(sellerId)
      else next.add(sellerId)
      return next
    })
  }

  // ── Pay dialog logic ──
  const openPayDialog = (group: SellerGroup) => {
    setPayingSeller(group)
    // Pre-select only commissions of the first currency found (USD priority)
    const hasUSD = group.commissions.some((c) => getCommCurrency(c) !== "ARS")
    const defaultCur = hasUSD ? "USD" : "ARS"
    const defaultSelected = group.commissions
      .filter((c) => (defaultCur === "ARS" ? getCommCurrency(c) === "ARS" : getCommCurrency(c) !== "ARS"))
      .map((c) => c.id)
    setSelectedCommissionIds(new Set(defaultSelected))
    // Initialize pay amounts to remaining balance for each commission
    const amounts: Record<string, number> = {}
    for (const c of group.commissions) {
      amounts[c.id] = getRemaining(c)
    }
    setPayAmounts(amounts)
    setPayAccountId("")
    setPayDate(new Date().toISOString().split("T")[0])
    setPayNotes("")
    setPayDialogOpen(true)
    fetchFinancialAccounts()
  }

  const toggleCommissionSelection = (id: string, comm: Commission) => {
    setSelectedCommissionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        // If selecting a different currency, clear previous selections
        const newCur = getCommCurrency(comm)
        const existingCur = getSelectedCurrency()
        if (existingCur && existingCur !== newCur) {
          // Switch currency: deselect all previous, select only this one
          next.clear()
          setPayAccountId("") // Reset account since currency changed
        }
        next.add(id)
      }
      return next
    })
  }

  // Get the currency of currently selected commissions
  const getSelectedCurrency = useCallback((): string | null => {
    if (!payingSeller || selectedCommissionIds.size === 0) return null
    const firstSelected = payingSeller.commissions.find((c) => selectedCommissionIds.has(c.id))
    return firstSelected ? getCommCurrency(firstSelected) : null
  }, [payingSeller, selectedCommissionIds])

  const selectedCurrency = useMemo(() => getSelectedCurrency(), [getSelectedCurrency])

  // Filter accounts by selected currency
  const filteredAccounts = useMemo(() => {
    if (!selectedCurrency) return financialAccounts
    return financialAccounts.filter((acc) => acc.currency === selectedCurrency)
  }, [financialAccounts, selectedCurrency])

  // Group dialog commissions by currency
  const dialogCommissionsByCurrency = useMemo(() => {
    if (!payingSeller) return { USD: [], ARS: [] }
    const grouped: Record<string, Commission[]> = { USD: [], ARS: [] }
    for (const c of payingSeller.commissions) {
      const cur = getCommCurrency(c)
      if (cur === "ARS") grouped.ARS.push(c)
      else grouped.USD.push(c)
    }
    return grouped
  }, [payingSeller])

  const selectedTotal = useMemo(() => {
    if (!payingSeller) return 0
    return payingSeller.commissions
      .filter((c) => selectedCommissionIds.has(c.id))
      .reduce((s, c) => s + (payAmounts[c.id] ?? getRemaining(c)), 0)
  }, [payingSeller, selectedCommissionIds, payAmounts])

  const handleConfirmPay = async () => {
    if (!payingSeller || selectedCommissionIds.size === 0 || !payAccountId) {
      toast({ title: "Error", description: "Selecciona al menos una comision y una cuenta financiera.", variant: "destructive" })
      return
    }

    setPaySubmitting(true)
    let successCount = 0
    let errorCount = 0

    for (const commId of Array.from(selectedCommissionIds)) {
      const comm = payingSeller.commissions.find((c) => c.id === commId)
      if (!comm) continue

      const payAmount = payAmounts[commId] ?? getRemaining(comm)
      if (payAmount <= 0) continue

      try {
        const res = await fetch("/api/commissions/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commissionId: comm.id,
            amount: payAmount,
            currency: getCommCurrency(comm),
            datePaid: payDate,
            method: "BANK",
            notes: payNotes || null,
            financial_account_id: payAccountId,
          }),
        })

        if (res.ok) {
          successCount++
        } else {
          const errData = await res.json()
          console.error(`Error paying commission ${commId}:`, errData.error)
          toast({ title: "Error en comisión", description: errData.error || "Error desconocido", variant: "destructive" })
          errorCount++
        }
      } catch {
        errorCount++
      }
    }

    setPaySubmitting(false)
    setPayDialogOpen(false)

    if (successCount > 0) {
      toast({
        title: "Pagos realizados",
        description: `${successCount} comision(es) pagada(s) exitosamente.${errorCount > 0 ? ` ${errorCount} con error.` : ""}`,
      })
    } else {
      toast({
        title: "Error",
        description: "No se pudo realizar ningun pago.",
        variant: "destructive",
      })
    }

    // Refresh data
    fetchPendingCommissions()
    fetchPaidThisMonth()
    if (activeTab === "historial") fetchPaidCommissions()
  }

  // ─── Render helpers ──────────────────────────────────────────────────────────

  /** Renders currency totals inline, e.g. "US$ 500.00 | $ 15,000.00" */
  const renderCurrencyTotals = (usd: number, ars: number, className = "") => {
    const parts: React.ReactNode[] = []
    if (usd > 0) parts.push(<span key="usd">{fmtCurrency(usd, "USD")}</span>)
    if (ars > 0) parts.push(<span key="ars">{fmtCurrency(ars, "ARS")}</span>)
    if (parts.length === 0) parts.push(<span key="zero">{fmtCurrency(0, "USD")}</span>)
    return (
      <div className={`flex flex-col gap-0.5 ${className}`}>
        {parts}
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Comisiones</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="por-pagar" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Por Pagar
          </TabsTrigger>
          <TabsTrigger value="historial" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Historial de Pagos
          </TabsTrigger>
          <TabsTrigger value="reglas" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Reglas
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB: Por Pagar ─── */}
        <TabsContent value="por-pagar" className="space-y-6 mt-6">
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            {/* Total Pendiente USD */}
            <div className="rounded-xl border border-border/40 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-warning/10">
                  <DollarSign className="h-3.5 w-3.5 text-warning" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">Pendiente USD</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {pendingLoading ? <Skeleton className="h-8 w-32" /> : fmtCurrency(pendingTotals.usd, "USD")}
              </p>
            </div>

            {/* Total Pendiente ARS */}
            <div className="rounded-xl border border-border/40 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-warning/10">
                  <DollarSign className="h-3.5 w-3.5 text-warning" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">Pendiente ARS</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {pendingLoading ? <Skeleton className="h-8 w-32" /> : fmtCurrency(pendingTotals.ars, "ARS")}
              </p>
            </div>

            {/* Vendedores */}
            <div className="rounded-xl border border-border/40 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <Users className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">Vendedores con Pendiente</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {pendingLoading ? <Skeleton className="h-8 w-16" /> : sellersWithPending}
              </p>
            </div>

            {/* Pagado este mes */}
            <div className="rounded-xl border border-border/40 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                  <CreditCard className="h-3.5 w-3.5 text-success" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">Pagado este mes</p>
              </div>
              <div className="text-2xl font-semibold tabular-nums tracking-tight">
                {pendingLoading ? (
                  <Skeleton className="h-8 w-32" />
                ) : (
                  renderCurrencyTotals(paidThisMonthUSD, paidThisMonthARS)
                )}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={pendingMonth} onValueChange={setPendingMonth}>
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
              value={pendingDateFrom}
              onChange={(e) => setPendingDateFrom(e.target.value)}
              placeholder="Desde"
              className="h-8 text-xs rounded-full border-border/60 bg-background w-[150px]"
            />
            <Input
              type="date"
              value={pendingDateTo}
              onChange={(e) => setPendingDateTo(e.target.value)}
              placeholder="Hasta"
              className="h-8 text-xs rounded-full border-border/60 bg-background w-[150px]"
            />

            <Button size="sm" className="rounded-full" onClick={fetchPendingCommissions} disabled={pendingLoading}>
              {pendingLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Actualizar
            </Button>
          </div>

          {/* Grouped Table with scroll + sticky footer */}
          <div className="rounded-xl border border-border/40">
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/50 z-10">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-center">Operaciones Pendientes</TableHead>
                    <TableHead className="text-right">Monto Total</TableHead>
                    <TableHead className="text-right">Accion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={`skel-${i}`}>
                        <TableCell colSpan={5}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : sellerGroups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                        No hay comisiones pendientes
                      </TableCell>
                    </TableRow>
                  ) : (
                    sellerGroups.map((group) => {
                      const isExpanded = expandedSellers.has(group.sellerId)
                      return (
                        <>
                          <TableRow
                            key={group.sellerId}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => toggleSeller(group.sellerId)}
                          >
                            <TableCell className="w-8">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{group.sellerName}</TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-warning/10 text-warning border-0">
                                {group.count}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {renderCurrencyTotals(group.totalPendingUSD, group.totalPendingARS, "items-end")}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                className="rounded-full"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openPayDialog(group)
                                }}
                              >
                                Pagar
                              </Button>
                            </TableCell>
                          </TableRow>
                          {isExpanded &&
                            group.commissions.map((c) => {
                              const hasPartial = (c.amount_paid || 0) > 0 && (c.amount_paid || 0) < c.amount
                              return (
                                <TableRow key={c.id} className="bg-muted/10">
                                  <TableCell />
                                  <TableCell className="text-sm text-muted-foreground pl-10">
                                    <Link
                                      href={`/operations/${c.operation_id}`}
                                      className="text-primary hover:underline"
                                      prefetch={false}
                                    >
                                      {c.operation?.file_code || c.operation_id.slice(0, 8)}
                                    </Link>
                                    {" - "}
                                    {c.operation?.destination || "Sin destino"}
                                    {hasPartial && (
                                      <Badge className="ml-2 bg-blue-500/10 text-blue-500 border-0 text-[10px]">
                                        Pago parcial
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center text-sm text-muted-foreground">
                                    {c.operation?.departure_date
                                      ? format(new Date(c.operation.departure_date), "dd/MM/yyyy", { locale: es })
                                      : "-"}
                                  </TableCell>
                                  <TableCell className="text-right text-sm tabular-nums">
                                    <div>
                                      {fmtCurrency(c.amount, getCommCurrency(c))}
                                      {hasPartial && (
                                        <p className="text-[10px] text-muted-foreground">
                                          Pagado: {fmtCurrency(c.amount_paid || 0, getCommCurrency(c))} | Rest: {fmtCurrency(getRemaining(c), getCommCurrency(c))}
                                        </p>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right text-sm text-muted-foreground">
                                    {c.percentage !== null && c.percentage !== undefined ? `${c.percentage.toFixed(2)}%` : "-"}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                        </>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {/* Subtotal footer outside scroll */}
            {!pendingLoading && sellerGroups.length > 0 && (
              <div className="border-t border-border/40 px-4 py-3 bg-muted/30 flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Total Pendiente</p>
                <div className="flex items-center gap-4">
                  {pendingTotals.usd > 0 && (
                    <p className="text-sm font-semibold tabular-nums">{fmtCurrency(pendingTotals.usd, "USD")}</p>
                  )}
                  {pendingTotals.ars > 0 && (
                    <p className="text-sm font-semibold tabular-nums">{fmtCurrency(pendingTotals.ars, "ARS")}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── TAB: Historial de Pagos ─── */}
        <TabsContent value="historial" className="space-y-6 mt-6">
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border/40 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                  <DollarSign className="h-3.5 w-3.5 text-success" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">Total Pagado USD</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {paidLoading ? <Skeleton className="h-8 w-32" /> : fmtCurrency(paidTotals.usd, "USD")}
              </p>
            </div>

            <div className="rounded-xl border border-border/40 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                  <DollarSign className="h-3.5 w-3.5 text-success" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">Total Pagado ARS</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {paidLoading ? <Skeleton className="h-8 w-32" /> : fmtCurrency(paidTotals.ars, "ARS")}
              </p>
            </div>

            <div className="rounded-xl border border-border/40 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <Receipt className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="text-xs font-medium text-muted-foreground">Cantidad de Pagos</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                {paidLoading ? <Skeleton className="h-8 w-16" /> : paidCount}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={paidSellerFilter} onValueChange={setPaidSellerFilter}>
              <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los vendedores</SelectItem>
                {paidSellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={paidMonth} onValueChange={setPaidMonth}>
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
              value={paidDateFrom}
              onChange={(e) => setPaidDateFrom(e.target.value)}
              placeholder="Desde"
              className="h-8 text-xs rounded-full border-border/60 bg-background w-[150px]"
            />
            <Input
              type="date"
              value={paidDateTo}
              onChange={(e) => setPaidDateTo(e.target.value)}
              placeholder="Hasta"
              className="h-8 text-xs rounded-full border-border/60 bg-background w-[150px]"
            />

            <Button size="sm" className="rounded-full" onClick={fetchPaidCommissions} disabled={paidLoading}>
              {paidLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Actualizar
            </Button>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border/40">
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/50 z-10">
                  <TableRow>
                    <SortableTableHead sortKey="date_paid" sortConfig={paidSortConfig} onSort={requestPaidSort}>Fecha Pago</SortableTableHead>
                    <SortableTableHead sortKey="sellers.name" sortConfig={paidSortConfig} onSort={requestPaidSort}>Vendedor</SortableTableHead>
                    <SortableTableHead sortKey="operation.file_code" sortConfig={paidSortConfig} onSort={requestPaidSort}>Operacion</SortableTableHead>
                    <SortableTableHead sortKey="operation.destination" sortConfig={paidSortConfig} onSort={requestPaidSort}>Destino</SortableTableHead>
                    <SortableTableHead sortKey="amount" sortConfig={paidSortConfig} onSort={requestPaidSort} className="text-right">Monto</SortableTableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paidLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`skel-paid-${i}`}>
                        <TableCell colSpan={6}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : paidCommissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                        No hay pagos en el periodo seleccionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedPaidCommissions.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">
                          {c.date_paid
                            ? format(new Date(c.date_paid), "dd/MM/yyyy", { locale: es })
                            : "-"}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {c.sellers?.name || "Desconocido"}
                        </TableCell>
                        <TableCell className="text-sm">
                          <Link
                            href={`/operations/${c.operation_id}`}
                            className="text-primary hover:underline"
                            prefetch={false}
                          >
                            {c.operation?.file_code || c.operation_id.slice(0, 8)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.operation?.destination || "Sin destino"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">
                          {fmtCurrency(c.amount, getCommCurrency(c))}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-success/10 text-success border-0">Pagado</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {/* Subtotal footer */}
            {!paidLoading && paidCommissions.length > 0 && (
              <div className="border-t border-border/40 px-4 py-3 bg-muted/30 flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">Total Pagado</p>
                <div className="flex items-center gap-4">
                  {paidTotals.usd > 0 && (
                    <p className="text-sm font-semibold tabular-nums">{fmtCurrency(paidTotals.usd, "USD")}</p>
                  )}
                  {paidTotals.ars > 0 && (
                    <p className="text-sm font-semibold tabular-nums">{fmtCurrency(paidTotals.ars, "ARS")}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── TAB: Reglas ─── */}
        <TabsContent value="reglas" className="mt-6">
          <CommissionsSettings />
        </TabsContent>
      </Tabs>

      {/* ─── Pay Commission Dialog ─── */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pagar Comisiones - {payingSeller?.sellerName}</DialogTitle>
            <DialogDescription>
              Selecciona las comisiones a pagar y la cuenta financiera.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Commissions list grouped by currency */}
            {(["USD", "ARS"] as const).map((cur) => {
              const comms = dialogCommissionsByCurrency[cur]
              if (!comms || comms.length === 0) return null
              const sectionTotal = comms
                .filter((c) => selectedCommissionIds.has(c.id))
                .reduce((s, c) => s + (payAmounts[c.id] ?? getRemaining(c)), 0)
              const isSectionActive = !selectedCurrency || selectedCurrency === cur

              return (
                <div key={cur} className={`rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4 transition-opacity ${!isSectionActive ? "opacity-40" : ""}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                      <Receipt className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
                      Comisiones en {cur}
                    </h4>
                  </div>

                  <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                    {comms.map((c) => {
                      const remaining = getRemaining(c)
                      const hasPartial = (c.amount_paid || 0) > 0
                      const isSelected = selectedCommissionIds.has(c.id)
                      return (
                        <div
                          key={c.id}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors"
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleCommissionSelection(c.id, c)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              <Link href={`/operations/${c.operation_id}`} className="text-primary hover:underline" prefetch={false}>
                                {c.operation?.file_code || c.operation_id.slice(0, 8)}
                              </Link>
                              {" - "}
                              {c.operation?.destination || "Sin destino"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {c.operation?.departure_date
                                ? format(new Date(c.operation.departure_date), "dd/MM/yyyy", { locale: es })
                                : "Sin fecha"}
                              {hasPartial && (
                                <span className="ml-2 text-blue-500">
                                  (Pagado: {fmtCurrency(c.amount_paid || 0, cur)} | Restante: {fmtCurrency(remaining, cur)})
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isSelected ? (
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={remaining}
                                value={payAmounts[c.id] ?? remaining}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0
                                  setPayAmounts((prev) => ({ ...prev, [c.id]: Math.min(val, remaining) }))
                                }}
                                className="h-8 w-28 text-sm text-right tabular-nums"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <p className="text-sm font-semibold tabular-nums whitespace-nowrap">
                                {fmtCurrency(remaining, cur)}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/40">
                    <p className="text-sm font-medium">Subtotal {cur}</p>
                    <p className="text-lg font-semibold tabular-nums tracking-tight">
                      {fmtCurrency(sectionTotal, cur)}
                    </p>
                  </div>
                </div>
              )
            })}

            {/* Mixed currency warning */}
            {selectedCurrency === null && selectedCommissionIds.size === 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Selecciona comisiones de una sola moneda para realizar el pago.
                </p>
              </div>
            )}

            {/* Total selected */}
            {selectedCommissionIds.size > 0 && (
              <div className="flex items-center justify-between px-1">
                <p className="text-sm font-semibold">Total a pagar</p>
                <p className="text-xl font-bold tabular-nums tracking-tight">
                  {fmtCurrency(selectedTotal, selectedCurrency || "USD")}
                </p>
              </div>
            )}

            {/* Payment details */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <CreditCard className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
                  Detalles del Pago
                </h4>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Cuenta Financiera {selectedCurrency ? `(${selectedCurrency})` : ""}</Label>
                  <Select value={payAccountId} onValueChange={setPayAccountId}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Seleccionar cuenta..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({acc.currency})
                          {acc.current_balance !== undefined && (
                            <span className="text-xs text-muted-foreground ml-2">
                              - Balance: {fmtCurrency(acc.current_balance, acc.currency)}
                            </span>
                          )}
                          {acc.agencies?.name ? ` - ${acc.agencies.name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Fecha de pago</Label>
                  <Input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Notas (opcional)</Label>
                <Textarea
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Agregar notas sobre el pago..."
                  className="text-sm resize-none"
                  rows={2}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 pb-5">
            <Button variant="outline" size="sm" onClick={() => setPayDialogOpen(false)} disabled={paySubmitting}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmPay}
              disabled={paySubmitting || selectedCommissionIds.size === 0 || !payAccountId}
            >
              {paySubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Confirmar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
