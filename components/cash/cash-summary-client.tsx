"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { ArrowUpCircle, ArrowDownCircle, Wallet, HelpCircle } from "lucide-react"
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
  created_at: string
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

export function CashSummaryClient({ agencies, defaultDateFrom, defaultDateTo }: CashSummaryClientProps) {
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
  const [loading, setLoading] = useState(true)
  const [loadingMovements, setLoadingMovements] = useState<Record<string, boolean>>({})

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      // Obtener balances de cuentas financieras
      const accountsResponse = await fetch("/api/accounting/financial-accounts")
      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json()
        setAccounts(accountsData.accounts || [])
      }

      // Obtener evolución diaria de la caja
      if (!dateFrom || !dateTo) return
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
      console.error("Error fetching summary:", error)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, selectedAgencyId, selectedAccountId])

  const fetchAccountMovements = useCallback(async (accountId: string) => {
    if (!dateFrom || !dateTo) return

    setLoadingMovements(prev => ({ ...prev, [accountId]: true }))
    try {
      const response = await fetch(
        `/api/accounting/ledger?accountId=${accountId}&dateFrom=${format(dateFrom, "yyyy-MM-dd")}&dateTo=${format(dateTo, "yyyy-MM-dd")}&type=ALL`
      )
      if (response.ok) {
        const data = await response.json()
        setAccountMovements(prev => ({ ...prev, [accountId]: data.movements || [] }))
      }
    } catch (error) {
      console.error("Error fetching account movements:", error)
    } finally {
      setLoadingMovements(prev => ({ ...prev, [accountId]: false }))
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

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
      .reduce((sum, acc) => sum + (acc.current_balance || 0), 0)

    const efectivoUSD = filteredAccounts
      .filter((acc) => acc.type === "CASH_USD")
      .reduce((sum, acc) => sum + (acc.current_balance || 0), 0)

    const cajaAhorroARS = filteredAccounts
      .filter((acc) => acc.type === "SAVINGS_ARS")
      .reduce((sum, acc) => sum + (acc.current_balance || 0), 0)

    const cajaAhorroUSD = filteredAccounts
      .filter((acc) => acc.type === "SAVINGS_USD")
      .reduce((sum, acc) => sum + (acc.current_balance || 0), 0)

    const bancosARS = filteredAccounts
      .filter((acc) => (acc.type === "CHECKING_ARS" || acc.type === "SAVINGS_ARS"))
      .reduce((sum, acc) => sum + (acc.current_balance || 0), 0)

    const bancosUSD = filteredAccounts
      .filter((acc) => (acc.type === "CHECKING_USD" || acc.type === "SAVINGS_USD"))
      .reduce((sum, acc) => sum + (acc.current_balance || 0), 0)

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

  // Calcular ingresos y egresos por cuenta
  const calculateAccountStats = useCallback((accountId: string) => {
    const movements = accountMovements[accountId] || []
    const income = movements
      .filter(m => m.type === "INCOME")
      .reduce((sum, m) => sum + (m.amount_original || 0), 0)
    const expenses = movements
      .filter(m => m.type === "EXPENSE")
      .reduce((sum, m) => sum + (m.amount_original || 0), 0)
    return { income, expenses }
  }, [accountMovements])

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
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">Caja</h1>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-medium mb-1">¿Cómo funciona?</p>
                <p className="text-xs mb-2"><strong>Resumen:</strong> Muestra los saldos actuales de todas las cuentas financieras (efectivo, bancos, etc.).</p>
                <p className="text-xs mb-2"><strong>Caja USD/ARS:</strong> Detalle de cada cuenta individual con ingresos, egresos, balance y movimientos centralizados para reconciliación bancaria.</p>
                <p className="text-xs">Los movimientos se cargan bajo demanda al hacer click en &quot;Ver Movimientos&quot; para optimizar el rendimiento.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-muted-foreground">Monitorea el estado de la caja y sus movimientos</p>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="agency-filter-caja" className="text-sm font-medium">Agencia</Label>
            <Select
              value={selectedAgencyId}
              onValueChange={(v) => {
                setSelectedAgencyId(v)
                setSelectedAccountId("ALL") // Resetear cuenta cuando cambia agencia
                setAccountMovements({})
              }}
            >
              <SelectTrigger id="agency-filter-caja" className="w-[220px]">
                <SelectValue placeholder="Selecciona una agencia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas las agencias</SelectItem>
                {agencies.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-filter-caja" className="text-sm font-medium">Cuenta</Label>
            <Select
              value={selectedAccountId}
              onValueChange={(v) => {
                setSelectedAccountId(v)
                setAccountMovements({})
              }}
            >
              <SelectTrigger id="account-filter-caja" className="w-[220px]">
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
          </div>
          <div className="space-y-2 flex-1 min-w-[200px]">
            <Label className="text-sm font-medium">Rango de fechas</Label>
            <div className="flex items-center gap-2">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">Desde</Label>
                <DateInputWithCalendar
                  value={dateFrom}
                  onChange={(date) => {
                    setDateFrom(date)
                    if (date && dateTo && dateTo < date) {
                      setDateTo(undefined)
                    }
                    // Limpiar movimientos cuando cambia la fecha
                    setAccountMovements({})
                  }}
                  placeholder="dd/MM/yyyy"
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">Hasta</Label>
                <DateInputWithCalendar
                  value={dateTo}
                  onChange={(date) => {
                    if (date && dateFrom && date < dateFrom) {
                      return
                    }
                    setDateTo(date)
                    // Limpiar movimientos cuando cambia la fecha
                    setAccountMovements({})
                  }}
                  placeholder="dd/MM/yyyy"
                  minDate={dateFrom}
                />
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <button
              onClick={async () => {
                if (confirm("¿Sincronizar pagos pagados con movimientos de caja? Esto creará movimientos para todos los pagos que no tienen movimiento asociado.")) {
                  try {
                    const response = await fetch("/api/cash/sync-movements", { method: "POST" })
                    const data = await response.json()
                    if (response.ok) {
                      alert(`✅ ${data.message}\nCreados: ${data.created}\nErrores: ${data.errors}`)
                      fetchSummary() // Recargar datos
                    } else {
                      alert(`❌ Error: ${data.error}`)
                    }
                  } catch (error) {
                    alert("❌ Error al sincronizar")
                  }
                }
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
            >
              Sincronizar Movimientos
            </button>
          </div>
        </div>
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
        <Card>
            <CardHeader>
              <CardTitle>Cuentas Financieras</CardTitle>
              <CardDescription>Balance actual de todas las cuentas</CardDescription>
          </CardHeader>
          <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">Cuentas USD</h3>
                  <div className="space-y-2">
                    {usdAccounts.map(account => (
                      <div key={account.id} className="flex items-center justify-between p-2 border rounded">
                        <span className="text-sm">{account.name}</span>
                        <span className="font-medium">{formatCurrency(account.current_balance || 0, "USD")}</span>
                      </div>
                    ))}
                    {usdAccounts.length === 0 && (
                      <p className="text-sm text-muted-foreground">No hay cuentas USD</p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-2">Cuentas ARS</h3>
                  <div className="space-y-2">
                    {arsAccounts.map(account => (
                      <div key={account.id} className="flex items-center justify-between p-2 border rounded">
                        <span className="text-sm">{account.name}</span>
                        <span className="font-medium">{formatCurrency(account.current_balance || 0, "ARS")}</span>
                      </div>
                    ))}
                    {arsAccounts.length === 0 && (
                      <p className="text-sm text-muted-foreground">No hay cuentas ARS</p>
                    )}
                  </div>
                </div>
              </div>
          </CardContent>
        </Card>
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
                  <Card key={account.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{account.name}</CardTitle>
                          <CardDescription>{account.type.replace("_", " ")}</CardDescription>
                        </div>
                        <Badge variant="outline" className="text-lg font-semibold">
                          {formatCurrency(account.current_balance || 0, "USD")}
                        </Badge>
                      </div>
          </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Resumen de ingresos y egresos */}
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                          <ArrowUpCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                          <div>
                            <p className="text-xs text-muted-foreground">Ingresos</p>
                            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                              {formatCurrency(stats.income, "USD")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                          <ArrowDownCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                          <div>
                            <p className="text-xs text-muted-foreground">Egresos</p>
                            <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                              {formatCurrency(stats.expenses, "USD")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                          <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          <div>
                            <p className="text-xs text-muted-foreground">Balance</p>
                            <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                              {formatCurrency(account.current_balance || 0, "USD")}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Botón para cargar movimientos */}
                      {!accountMovements[account.id] && !isLoading && (
                        <button
                          onClick={() => fetchAccountMovements(account.id)}
                          className="w-full py-2 text-sm border rounded-md hover:bg-muted"
                        >
                          Ver Movimientos
                        </button>
                      )}

                      {/* Tabla de movimientos */}
                      {accountMovements[account.id] && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Movimientos</h4>
                          {isLoading ? (
                            <Skeleton className="h-32 w-full" />
                          ) : movements.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No hay movimientos en el período seleccionado</p>
                          ) : (
                            <div className="border rounded-md overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead className="text-right">Monto</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {movements.map((movement) => (
                                    <TableRow key={movement.id}>
                                      <TableCell className="text-sm">
                                        {format(new Date(movement.created_at), "dd/MM/yyyy", { locale: es })}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant={movement.type === "INCOME" ? "default" : "destructive"}
                                        >
                                          {movement.type === "INCOME" ? "Ingreso" : "Egreso"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {movement.concept}
                                        {movement.operations && (
                                          <span className="text-muted-foreground ml-1">
                                            ({movement.operations.file_code})
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell className={`text-right font-medium ${movement.type === "INCOME" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                        {movement.type === "INCOME" ? "+" : "-"}
                                        {formatCurrency(movement.amount_original, movement.currency)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      )}
          </CardContent>
        </Card>
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
                  <Card key={account.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{account.name}</CardTitle>
                          <CardDescription>{account.type.replace("_", " ")}</CardDescription>
                        </div>
                        <Badge variant="outline" className="text-lg font-semibold">
                          {formatCurrency(account.current_balance || 0, "ARS")}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Resumen de ingresos y egresos */}
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                          <ArrowUpCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                          <div>
                            <p className="text-xs text-muted-foreground">Ingresos</p>
                            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                              {formatCurrency(stats.income, "ARS")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                          <ArrowDownCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                          <div>
                            <p className="text-xs text-muted-foreground">Egresos</p>
                            <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                              {formatCurrency(stats.expenses, "ARS")}
                            </p>
                          </div>
                            </div>
                        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                          <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          <div>
                            <p className="text-xs text-muted-foreground">Balance</p>
                            <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                              {formatCurrency(account.current_balance || 0, "ARS")}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Botón para cargar movimientos */}
                      {!accountMovements[account.id] && !isLoading && (
                        <button
                          onClick={() => fetchAccountMovements(account.id)}
                          className="w-full py-2 text-sm border rounded-md hover:bg-muted"
                        >
                          Ver Movimientos
                        </button>
                      )}

                      {/* Tabla de movimientos */}
                      {accountMovements[account.id] && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Movimientos</h4>
                          {isLoading ? (
                            <Skeleton className="h-32 w-full" />
                          ) : movements.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No hay movimientos en el período seleccionado</p>
                          ) : (
                            <div className="border rounded-md overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Concepto</TableHead>
                                    <TableHead className="text-right">Monto</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {movements.map((movement) => (
                                    <TableRow key={movement.id}>
                                      <TableCell className="text-sm">
                                        {format(new Date(movement.created_at), "dd/MM/yyyy", { locale: es })}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant={movement.type === "INCOME" ? "default" : "destructive"}
                                        >
                                          {movement.type === "INCOME" ? "Ingreso" : "Egreso"}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {movement.concept}
                                        {movement.operations && (
                                          <span className="text-muted-foreground ml-1">
                                            ({movement.operations.file_code})
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell className={`text-right font-medium ${movement.type === "INCOME" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                        {movement.type === "INCOME" ? "+" : "-"}
                                        {formatCurrency(movement.amount_original, movement.currency)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
          )}
        </CardContent>
      </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
