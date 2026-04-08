"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/currency"
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
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
import { ArrowUpCircle, ArrowDownCircle, Wallet, HelpCircle, DollarSign, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { UserRole } from "@/lib/permissions"
import { toast } from "sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface CashSummaryClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultDateFrom: string
  defaultDateTo: string
  currentUserRole: UserRole
}

interface AccountBalance {
  id: string
  name: string
  type: string
  currency: string
  current_balance: number
  is_active?: boolean
  agency_id?: string | null
}

interface DailyBalance {
  date: string
  balance: number
}

interface LedgerMovement {
  id: string
  type: string
  concept: string
  currency: "ARS" | "USD"
  amount_original: number
  amount_ars_equivalent: number
  affects_balance?: boolean
  created_at: string
  movement_date?: string
  financial_accounts?: {
    id: string
    name: string
    type: string
    currency: string
  }
  operations?: {
    id: string
    destination: string
    file_code: string
    customer_names?: string
    operation_customers?: Array<{
      customers: {
        first_name: string
        last_name: string
      }
    }>
  } | null
}

const chartConfig = {
  balance: {
    label: "Balance",
    theme: {
      light: "hsl(142, 76%, 36%)",
      dark: "hsl(142, 76%, 50%)",
    },
  },
} satisfies ChartConfig

export function CashSummaryClient({ agencies, defaultDateFrom, defaultDateTo, currentUserRole }: CashSummaryClientProps) {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => {
    try {
      return defaultDateFrom ? parseISO(defaultDateFrom) : undefined
    } catch {
      return undefined
    }
  })
  const [dateTo, setDateTo] = useState<Date | undefined>(() => {
    try {
      return defaultDateTo ? parseISO(defaultDateTo) : undefined
    } catch {
      return undefined
    }
  })
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>("ALL")
  const [selectedAccountId, setSelectedAccountId] = useState<string>("ALL")
  const [activeTab, setActiveTab] = useState("resumen")
  const [accounts, setAccounts] = useState<AccountBalance[]>([])
  const [dailyBalances, setDailyBalances] = useState<DailyBalance[]>([])
  const [accountMovements, setAccountMovements] = useState<Record<string, LedgerMovement[]>>({})
  const [accountStats, setAccountStats] = useState<Record<string, { income: number; expenses: number }>>({})
  const [loading, setLoading] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)
  const [loadingMovements, setLoadingMovements] = useState<Record<string, boolean>>({})
  const [loadingStats, setLoadingStats] = useState<Record<string, boolean>>({})
  const [togglingMovements, setTogglingMovements] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState("")
  const canManageBalanceImpact = currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN" || currentUserRole === "CONTABLE"

  // Cargar cuentas financieras (rápido, no depende de fechas)
  const fetchAccounts = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true)
    }
    try {
      const accountsResponse = await fetch("/api/accounting/financial-accounts")
      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json()
        setAccounts(accountsData.accounts || [])
      }
    } catch (error) {
      console.error("Error fetching accounts:", error)
      toast.error("Error al cargar cuentas financieras")
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [])

  // Cargar gráfico diario EN BACKGROUND (lento, no bloquea el render de cuentas)
  const fetchDailyBalance = useCallback(async () => {
    if (!dateFrom || !dateTo) return
    setLoadingChart(true)
    try {
      const dailyParams = new URLSearchParams({
        dateFrom: format(dateFrom, "yyyy-MM-dd"),
        dateTo: format(dateTo, "yyyy-MM-dd"),
      })
      if (selectedAgencyId !== "ALL") dailyParams.set("agencyId", selectedAgencyId)
      if (selectedAccountId !== "ALL") dailyParams.set("accountId", selectedAccountId)
      const dailyResponse = await fetch(`/api/cash/daily-balance?${dailyParams.toString()}`)
      if (dailyResponse.ok) {
        const dailyData = await dailyResponse.json()
        setDailyBalances(dailyData.dailyBalances || [])
      }
    } catch (error) {
      console.error("Error fetching daily balance:", error)
      toast.error("Error al cargar balance diario")
    } finally {
      setLoadingChart(false)
    }
  }, [dateFrom, dateTo, selectedAgencyId, selectedAccountId])

  const fetchAccountMovements = useCallback(async (accountId: string) => {
    if (!dateFrom || !dateTo) return

    setLoadingMovements(prev => ({ ...prev, [accountId]: true }))
    try {
      const response = await fetch(
        `/api/accounting/ledger?accountId=${accountId}&dateFrom=${format(dateFrom, "yyyy-MM-dd")}&dateTo=${format(dateTo, "yyyy-MM-dd")}&type=ALL&limit=5000`
      )
      if (response.ok) {
        const data = await response.json()
        setAccountMovements(prev => ({ ...prev, [accountId]: data.movements || [] }))
      }
    } catch (error) {
      console.error("Error fetching account movements:", error)
      toast.error("Error al cargar movimientos de la cuenta")
    } finally {
      setLoadingMovements(prev => ({ ...prev, [accountId]: false }))
    }
  }, [dateFrom, dateTo])

  // Batch: cargar stats de TODAS las cuentas en UNA sola request
  const fetchAllStats = useCallback(async (accountIds: string[]) => {
    if (!dateFrom || !dateTo || accountIds.length === 0) return

    // Marcar todas como loading
    setLoadingStats(prev => {
      const next = { ...prev }
      accountIds.forEach(id => { next[id] = true })
      return next
    })

    try {
      const response = await fetch(
        `/api/accounting/ledger/stats?accountIds=${accountIds.join(",")}&dateFrom=${format(dateFrom, "yyyy-MM-dd")}&dateTo=${format(dateTo, "yyyy-MM-dd")}`
      )
      if (response.ok) {
        const data = await response.json()
        const batchStats = data.stats || {}
        setAccountStats(prev => ({ ...prev, ...batchStats }))
      }
    } catch (error) {
      console.error("Error fetching batch stats:", error)
      toast.error("Error al cargar estadísticas de cuentas")
    } finally {
      setLoadingStats(prev => {
        const next = { ...prev }
        accountIds.forEach(id => { next[id] = false })
        return next
      })
    }
  }, [dateFrom, dateTo])

  // Cargar cuentas una sola vez al montar (no depende de fechas)
  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Cargar gráfico diario cuando cambian las fechas/filtros (no bloquea cuentas)
  useEffect(() => {
    if (activeTab === "resumen") {
      fetchDailyBalance()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, selectedAgencyId, selectedAccountId, activeTab])

  // Filtrar cuentas por agencia y cuenta individual
  const filteredAccounts = useMemo(() => {
    let filtered = accounts
    if (selectedAgencyId !== "ALL") {
      filtered = filtered.filter(
        (acc) => (acc.agency_id ?? null) === selectedAgencyId
      )
    }
    if (selectedAccountId !== "ALL") {
      filtered = filtered.filter((acc) => acc.id === selectedAccountId)
    }
    return filtered
  }, [accounts, selectedAgencyId, selectedAccountId])

  // Calcular KPIs (sobre cuentas filtradas)
  const kpis = useMemo(() => {
    const efectivoARS = filteredAccounts
      .filter((acc) => acc.type === "CASH_ARS")
      .reduce((sum, acc) => sum + (acc.current_balance ?? 0), 0)

    const efectivoUSD = filteredAccounts
      .filter((acc) => acc.type === "CASH_USD")
      .reduce((sum, acc) => sum + (acc.current_balance ?? 0), 0)

    const cajaAhorroARS = filteredAccounts
      .filter((acc) => acc.type === "SAVINGS_ARS")
      .reduce((sum, acc) => sum + (acc.current_balance ?? 0), 0)

    const cajaAhorroUSD = filteredAccounts
      .filter((acc) => acc.type === "SAVINGS_USD")
      .reduce((sum, acc) => sum + (acc.current_balance ?? 0), 0)

    const bancosARS = filteredAccounts
      .filter((acc) => (acc.type === "CHECKING_ARS" || acc.type === "SAVINGS_ARS"))
      .reduce((sum, acc) => sum + (acc.current_balance ?? 0), 0)

    const bancosUSD = filteredAccounts
      .filter((acc) => (acc.type === "CHECKING_USD" || acc.type === "SAVINGS_USD"))
      .reduce((sum, acc) => sum + (acc.current_balance ?? 0), 0)

    const totalARS = efectivoARS + bancosARS
    const totalUSD = efectivoUSD + bancosUSD

    return {
      efectivoARS,
      efectivoUSD,
      cajaAhorroARS,
      cajaAhorroUSD,
      bancosARS,
      bancosUSD,
      totalARS,
      totalUSD,
    }
  }, [filteredAccounts])

  // Filtrar cuentas por moneda (usando cuentas ya filtradas por agencia)
  const usdAccounts = useMemo(() => {
    return filteredAccounts
      .filter(acc => acc.currency === "USD" && acc.is_active !== false)
      .sort((a, b) => (b.current_balance || 0) - (a.current_balance || 0))
  }, [filteredAccounts])

  const arsAccounts = useMemo(() => {
    return filteredAccounts
      .filter(acc => acc.currency === "ARS" && acc.is_active !== false)
      .sort((a, b) => (b.current_balance || 0) - (a.current_balance || 0))
  }, [filteredAccounts])

  // Auto-cargar stats de TODAS las cuentas del tab activo en UNA sola request batch
  // Los movimientos se cargan bajo demanda con "Ver Movimientos" para no sobrecargar
  useEffect(() => {
    if (activeTab === "usd" || activeTab === "ars") {
      const targetAccounts = activeTab === "usd" ? usdAccounts : arsAccounts
      const accountsNeedingStats = targetAccounts
        .filter(account => !accountStats[account.id] && !loadingStats[account.id])
        .map(account => account.id)

      if (accountsNeedingStats.length > 0) {
        fetchAllStats(accountsNeedingStats)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, usdAccounts, arsAccounts, fetchAllStats])

  // Calcular ingresos y egresos por cuenta
  // Prioridad: stats pre-cargados (dataset completo, sin paginación)
  const calculateAccountStats = useCallback((accountId: string) => {
    if (accountStats[accountId]) return accountStats[accountId]
    // Fallback: calcular desde movements si están cargados
    if (accountMovements[accountId]) {
      const movements = accountMovements[accountId]
      return {
        income: movements.filter(m => m.type === "INCOME" || m.type === "FX_GAIN").reduce((s, m) => s + (m.amount_original || 0), 0),
        expenses: movements.filter(m => m.type !== "INCOME" && m.type !== "FX_GAIN").reduce((s, m) => s + (m.amount_original || 0), 0),
      }
    }
    return { income: 0, expenses: 0 }
  }, [accountMovements, accountStats])

  const refreshAccountData = useCallback(async (accountId: string) => {
    const refreshes: Promise<unknown>[] = [
      fetchAccounts({ silent: true }),
      fetchAllStats([accountId]),
      fetchDailyBalance(),
    ]

    if (accountMovements[accountId]) {
      refreshes.push(fetchAccountMovements(accountId))
    }

    await Promise.all(refreshes)
  }, [accountMovements, fetchAccountMovements, fetchAccounts, fetchAllStats, fetchDailyBalance])

  const handleToggleBalanceImpact = useCallback(async (accountId: string, movement: LedgerMovement) => {
    const nextAffectsBalance = movement.affects_balance === false

    setTogglingMovements((prev) => ({ ...prev, [movement.id]: true }))
    try {
      const response = await fetch(`/api/accounting/ledger/${movement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affects_balance: nextAffectsBalance }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar el movimiento")
      }

      toast.success(data.message || "Movimiento actualizado")
      await refreshAccountData(accountId)
    } catch (error) {
      console.error("Error updating ledger movement:", error)
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el movimiento")
    } finally {
      setTogglingMovements((prev) => ({ ...prev, [movement.id]: false }))
    }
  }, [refreshAccountData])

  // Preparar datos para el gráfico
  const chartData = useMemo(() => {
    return dailyBalances.map((item) => ({
      date: format(new Date(item.date), "dd/MM", { locale: es }),
      Balance: Math.round(item.balance),
    }))
  }, [dailyBalances])

  // Función para formatear números grandes en el eje Y
  const formatYAxisValue = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(0)}M`
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`
    }
    return `$${Math.round(value)}`
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Monitorea el estado de la caja y sus movimientos</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={selectedAgencyId}
            onValueChange={(v) => {
              setSelectedAgencyId(v)
              setSelectedAccountId("ALL")
              setAccountMovements({})
            }}
          >
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
              <SelectValue placeholder="Selecciona una agencia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las agencias</SelectItem>
              {agencies.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedAccountId}
            onValueChange={(v) => {
              setSelectedAccountId(v)
              setAccountMovements({})
            }}
          >
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
              <SelectValue placeholder="Todas las cuentas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las cuentas</SelectItem>
              {accounts
                .filter((acc) => selectedAgencyId === "ALL" || (acc.agency_id ?? null) === selectedAgencyId)
                .map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <DateInputWithCalendar
            value={dateFrom}
            onChange={(date) => {
              setDateFrom(date)
              if (date && dateTo && dateTo < date) {
                setDateTo(undefined)
              }
              setAccountMovements({})
              setAccountStats({})
            }}
            placeholder="Desde"
            className="h-8 text-xs rounded-full"
          />

          <DateInputWithCalendar
            value={dateTo}
            onChange={(date) => {
              if (date && dateFrom && date < dateFrom) {
                return
              }
              setDateTo(date)
              setAccountMovements({})
              setAccountStats({})
            }}
            placeholder="Hasta"
            minDate={dateFrom}
            className="h-8 text-xs rounded-full"
          />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="usd">Caja USD</TabsTrigger>
          <TabsTrigger value="ars">Caja ARS</TabsTrigger>
        </TabsList>

        {/* TAB: Resumen */}
        <TabsContent value="resumen" className="space-y-6">
          {/* Lista de todas las cuentas con sus saldos */}
          <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Cuentas Financieras</h2>
                <p className="text-sm text-muted-foreground">Balance actual de todas las cuentas</p>
              </div>
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-medium text-foreground/70">Cuentas USD</span>
                  </div>
                  <div className="space-y-2">
                    {usdAccounts.map(account => (
                      <div key={account.id} className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
                        <span className="text-sm font-medium">{account.name}</span>
                        <span className="text-base font-semibold tabular-nums">{formatCurrency(account.current_balance ?? 0, "USD")}</span>
                      </div>
                    ))}
                    {usdAccounts.length === 0 && (
                      <p className="text-sm text-muted-foreground">No hay cuentas USD</p>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <DollarSign className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs font-medium text-foreground/70">Cuentas ARS</span>
                  </div>
                  <div className="space-y-2">
                    {arsAccounts.map(account => (
                      <div key={account.id} className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
                        <span className="text-sm font-medium">{account.name}</span>
                        <span className="text-base font-semibold tabular-nums">{formatCurrency(account.current_balance ?? 0, "ARS")}</span>
                      </div>
                    ))}
                    {arsAccounts.length === 0 && (
                      <p className="text-sm text-muted-foreground">No hay cuentas ARS</p>
                    )}
                  </div>
                </div>
              </div>
          </div>
        </TabsContent>

        {/* TAB: Caja USD */}
        <TabsContent value="usd" className="space-y-4">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : usdAccounts.length === 0 ? (
        <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay cuentas USD configuradas
          </CardContent>
        </Card>
          ) : (
            <div className="space-y-6">
              {usdAccounts.map(account => {
                const stats = calculateAccountStats(account.id)
                const movements = accountMovements[account.id] || []
                const isLoading = loadingMovements[account.id] || false

                return (
                  <div key={account.id} className="rounded-xl border border-border/40 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold">{account.name}</h3>
                        <p className="text-xs text-muted-foreground">{account.type.replace("_", " ")}</p>
                      </div>
                      <p className="text-xl font-semibold tabular-nums tracking-tight">{formatCurrency(account.current_balance ?? 0, "USD")}</p>
                    </div>
                      {/* Resumen de ingresos y egresos */}
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="flex items-center gap-2 p-3 bg-success/5 rounded-xl border border-border/40">
                          <ArrowUpCircle className="h-5 w-5 text-success" />
                          <div>
                            <p className="text-xs text-muted-foreground">Ingresos</p>
                            <p className="text-lg font-semibold tabular-nums text-success">
                              {formatCurrency(stats.income, "USD")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-destructive/5 rounded-xl border border-border/40">
                          <ArrowDownCircle className="h-5 w-5 text-destructive" />
                          <div>
                            <p className="text-xs text-muted-foreground">Egresos</p>
                            <p className="text-lg font-semibold tabular-nums text-destructive">
                              {formatCurrency(stats.expenses, "USD")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-xl border border-border/40">
                          <Wallet className="h-5 w-5 text-primary" />
                          <div>
                            <p className="text-xs text-muted-foreground">Balance</p>
                            <p className="text-lg font-semibold tabular-nums text-primary">
                              {formatCurrency(account.current_balance ?? 0, "USD")}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Botón para cargar movimientos */}
                      {!accountMovements[account.id] && !isLoading && (
                        <button
                          onClick={() => fetchAccountMovements(account.id)}
                          className="w-full py-2 text-sm rounded-xl border border-border/40 hover:bg-muted/50 transition-colors text-muted-foreground"
                        >
                          Ver Movimientos
                        </button>
                      )}

                      {/* Tabla de movimientos */}
                      {isLoading && <Skeleton className="h-32 w-full" />}
                      {accountMovements[account.id] && !isLoading && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Movimientos</h4>
                          <div className="relative mb-2">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Buscar por cliente, operacion, concepto..."
                              className="h-8 pl-8 text-xs"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                            />
                          </div>
                          {movements.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No hay movimientos en el periodo seleccionado</p>
                          ) : (
                            <div className="rounded-xl border border-border/40 max-h-[40vh] overflow-y-auto">
                              <Table>
                                <TableHeader className="sticky top-0 bg-background z-10">
                                  <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead className="text-right">Monto</TableHead>
                                    {canManageBalanceImpact && <TableHead className="text-right">Accion</TableHead>}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {movements.filter(m => {
                                    if (!searchQuery) return true
                                    const q = searchQuery.toLowerCase()
                                    return (
                                      (m.concept || "").toLowerCase().includes(q) ||
                                      (m.operations?.file_code || "").toLowerCase().includes(q) ||
                                      (m.operations?.destination || "").toLowerCase().includes(q) ||
                                      (m.operations?.customer_names || "").toLowerCase().includes(q)
                                    )
                                  }).map((movement) => (
                                    <TableRow key={movement.id}>
                                      <TableCell className="text-sm">
                                        {format(new Date(movement.movement_date ?? movement.created_at), "dd/MM/yyyy", { locale: es })}
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="secondary" className={movement.type === "INCOME" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>
                                          {movement.type === "INCOME" ? "Ingreso" : "Egreso"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        <div className="space-y-1">
                                          <div>{movement.concept}</div>
                                          {movement.affects_balance === false && (
                                            <Badge variant="outline" className="text-[10px]">
                                              No afecta saldo
                                            </Badge>
                                          )}
                                        </div>
                                        {movement.operations && (
                                          <span className="text-muted-foreground ml-1">
                                            {(() => {
                                              const customerNames = movement.operations.operation_customers
                                                ?.map(oc => `${oc.customers.first_name} ${oc.customers.last_name}`.trim())
                                                .filter(Boolean)
                                                .join(", ")
                                              const parts = [customerNames, movement.operations.file_code].filter(Boolean)
                                              return parts.length > 0 ? `(${parts.join(" \u00b7 ")})` : ""
                                            })()}
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell className={`text-right font-medium ${movement.type === "INCOME" ? "text-success" : "text-destructive"}`}>
                                        {movement.type === "INCOME" ? "+" : "-"}
                                        {formatCurrency(movement.amount_original, movement.currency)}
                                      </TableCell>
                                      {canManageBalanceImpact && (
                                        <TableCell className="text-right">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={togglingMovements[movement.id]}
                                            onClick={() => handleToggleBalanceImpact(account.id, movement)}
                                          >
                                            {togglingMovements[movement.id]
                                              ? "Guardando..."
                                              : movement.affects_balance === false
                                                ? "Incluir saldo"
                                                : "Excluir saldo"}
                                          </Button>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                )
              })}
      </div>
          )}
        </TabsContent>

        {/* TAB: Caja ARS */}
        <TabsContent value="ars" className="space-y-4">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : arsAccounts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay cuentas ARS configuradas
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {arsAccounts.map(account => {
                const stats = calculateAccountStats(account.id)
                const movements = accountMovements[account.id] || []
                const isLoading = loadingMovements[account.id] || false

                      return (
                  <div key={account.id} className="rounded-xl border border-border/40 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-semibold">{account.name}</h3>
                        <p className="text-xs text-muted-foreground">{account.type.replace("_", " ")}</p>
                      </div>
                      <p className="text-xl font-semibold tabular-nums tracking-tight">{formatCurrency(account.current_balance ?? 0, "ARS")}</p>
                    </div>
                      {/* Resumen de ingresos y egresos */}
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="flex items-center gap-2 p-3 bg-success/5 rounded-xl border border-border/40">
                          <ArrowUpCircle className="h-5 w-5 text-success" />
                          <div>
                            <p className="text-xs text-muted-foreground">Ingresos</p>
                            <p className="text-lg font-semibold tabular-nums text-success">
                              {formatCurrency(stats.income, "ARS")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-destructive/5 rounded-xl border border-border/40">
                          <ArrowDownCircle className="h-5 w-5 text-destructive" />
                          <div>
                            <p className="text-xs text-muted-foreground">Egresos</p>
                            <p className="text-lg font-semibold tabular-nums text-destructive">
                              {formatCurrency(stats.expenses, "ARS")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-xl border border-border/40">
                          <Wallet className="h-5 w-5 text-primary" />
                          <div>
                            <p className="text-xs text-muted-foreground">Balance</p>
                            <p className="text-lg font-semibold tabular-nums text-primary">
                              {formatCurrency(account.current_balance ?? 0, "ARS")}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Botón para cargar movimientos */}
                      {!accountMovements[account.id] && !isLoading && (
                        <button
                          onClick={() => fetchAccountMovements(account.id)}
                          className="w-full py-2 text-sm rounded-xl border border-border/40 hover:bg-muted/50 transition-colors text-muted-foreground"
                        >
                          Ver Movimientos
                        </button>
                      )}

                      {/* Tabla de movimientos */}
                      {isLoading && <Skeleton className="h-32 w-full" />}
                      {accountMovements[account.id] && !isLoading && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Movimientos</h4>
                          <div className="relative mb-2">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Buscar por cliente, operacion, concepto..."
                              className="h-8 pl-8 text-xs"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                            />
                          </div>
                          {movements.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No hay movimientos en el periodo seleccionado</p>
                          ) : (
                            <div className="rounded-xl border border-border/40 max-h-[40vh] overflow-y-auto">
                              <Table>
                                <TableHeader className="sticky top-0 bg-background z-10">
                                  <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead className="text-right">Monto</TableHead>
                                    {canManageBalanceImpact && <TableHead className="text-right">Accion</TableHead>}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {movements.filter(m => {
                                    if (!searchQuery) return true
                                    const q = searchQuery.toLowerCase()
                                    return (
                                      (m.concept || "").toLowerCase().includes(q) ||
                                      (m.operations?.file_code || "").toLowerCase().includes(q) ||
                                      (m.operations?.destination || "").toLowerCase().includes(q) ||
                                      (m.operations?.customer_names || "").toLowerCase().includes(q)
                                    )
                                  }).map((movement) => (
                                    <TableRow key={movement.id}>
                                      <TableCell className="text-sm">
                                        {format(new Date(movement.movement_date ?? movement.created_at), "dd/MM/yyyy", { locale: es })}
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="secondary" className={movement.type === "INCOME" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>
                                          {movement.type === "INCOME" ? "Ingreso" : "Egreso"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        <div className="space-y-1">
                                          <div>{movement.concept}</div>
                                          {movement.affects_balance === false && (
                                            <Badge variant="outline" className="text-[10px]">
                                              No afecta saldo
                                            </Badge>
                                          )}
                                        </div>
                                        {movement.operations && (
                                          <span className="text-muted-foreground ml-1">
                                            {(() => {
                                              const customerNames = movement.operations.operation_customers
                                                ?.map(oc => `${oc.customers.first_name} ${oc.customers.last_name}`.trim())
                                                .filter(Boolean)
                                                .join(", ")
                                              const parts = [customerNames, movement.operations.file_code].filter(Boolean)
                                              return parts.length > 0 ? `(${parts.join(" \u00b7 ")})` : ""
                                            })()}
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell className={`text-right font-medium ${movement.type === "INCOME" ? "text-success" : "text-destructive"}`}>
                                        {movement.type === "INCOME" ? "+" : "-"}
                                        {formatCurrency(movement.amount_original, movement.currency)}
                                      </TableCell>
                                      {canManageBalanceImpact && (
                                        <TableCell className="text-right">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={togglingMovements[movement.id]}
                                            onClick={() => handleToggleBalanceImpact(account.id, movement)}
                                          >
                                            {togglingMovements[movement.id]
                                              ? "Guardando..."
                                              : movement.affects_balance === false
                                                ? "Incluir saldo"
                                                : "Excluir saldo"}
                                          </Button>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      )}
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
