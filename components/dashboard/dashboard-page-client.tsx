"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardFilters, DashboardFiltersState } from "./dashboard-filters"
import { SalesBySellerChart } from "./sales-by-seller-chart"
import { DestinationsChart } from "./destinations-chart"
import { DestinationsPieChart } from "./destinations-pie-chart"
import { RegionsRadarChart } from "./regions-radar-chart"
import { CashflowChart } from "./cashflow-chart"
import { PendingAlertsCard } from "./pending-alerts-card"
import { UpcomingTripsCard } from "./upcoming-trips-card"
import { TopSellersCard } from "./top-sellers-card"
import { PendingTasksCard } from "./pending-tasks-card"
import { BirthdaysTodayCard } from "./birthdays-today-card"
import { KpiCustomizer, type DashboardKpiId } from "./kpi-customizer"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { ArrowUpIcon, ArrowDownIcon } from "@radix-ui/react-icons"
import { HelpCircle, RefreshCw } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// Función para formatear números completos con separadores de miles
function formatNumber(value: number): string {
  if (isNaN(value) || value === null || value === undefined) {
    return "0"
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

interface DashboardPageClientProps {
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  defaultFilters: DashboardFiltersState
  userRole: string
}

interface KPIs {
  totalSales: number
  totalMargin: number
  operationsCount: number
  avgMarginPercent: number
  pendingCustomerPayments: number
  pendingOperatorPayments: number
}

interface KPIComparison {
  totalSales: number
  totalMargin: number
  operationsCount: number
}

function calculateChange(current: number, previous: number): { change: number; isPositive: boolean } {
  if (previous === 0) return { change: 0, isPositive: true }
  const change = ((current - previous) / previous) * 100
  return { change: Math.abs(change), isPositive: change >= 0 }
}

function ComparisonBadge({ current, previous, suffix = "%" }: { current: number; previous: number; suffix?: string }) {
  const { change, isPositive } = calculateChange(current, previous)
  
  if (change === 0 || previous === 0) return null
  
  return (
    <span className={`inline-flex items-center text-[10px] font-medium whitespace-nowrap ${isPositive ? "text-success" : "text-destructive"}`}>
      {isPositive ? (
        <ArrowUpIcon className="h-2.5 w-2.5" />
      ) : (
        <ArrowDownIcon className="h-2.5 w-2.5" />
      )}
      {change.toFixed(0)}{suffix}
    </span>
  )
}

export function DashboardPageClient({
  agencies,
  sellers,
  defaultFilters,
  userRole,
}: DashboardPageClientProps) {
  const isSeller = userRole === "SELLER"
  const [filters, setFilters] = useState(defaultFilters)
  const [loading, setLoading] = useState(false)
  // Progress 0-100 mientras se cargan las 8 fetches del dashboard.
  // Pure UI feedback — no afecta los datos en absoluto.
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [kpis, setKpis] = useState<KPIs>({
    totalSales: 0,
    totalMargin: 0,
    operationsCount: 0,
    avgMarginPercent: 0,
    pendingCustomerPayments: 0,
    pendingOperatorPayments: 0,
  })
  const [previousKpis, setPreviousKpis] = useState<KPIComparison>({
    totalSales: 0,
    totalMargin: 0,
    operationsCount: 0,
  })
  const [sellersData, setSellersData] = useState<any[]>([])
  const [destinationsData, setDestinationsData] = useState<any[]>([])
  const [destinationsAllData, setDestinationsAllData] = useState<any[]>([])
  const [cashflowData, setCashflowData] = useState<any[]>([])
  const [hiddenKpis, setHiddenKpis] = useState<Set<DashboardKpiId>>(new Set())

  // [perf-instrumentation] Loguea cuándo el page client component se monta
  // (relativo al page load del browser). Se correlaciona con CLICK del sidebar
  // y NAV del PerfNavLogger. Quitar tras la investigación.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PERF_LOG === "0") return
    // eslint-disable-next-line no-console
    console.log(`[perf:client] DashboardPageClient MOUNT at ${performance.now().toFixed(0)}ms`)
  }, [])

  // Carga de preferencias de KPIs ocultos (organization_settings.dashboard_hidden_kpis).
  // Usa el mismo endpoint que el resto de settings. Silenciosamente cae en
  // "mostrar todos" si la key no existe (tenants nuevos).
  useEffect(() => {
    async function loadHiddenKpis() {
      try {
        const res = await fetch("/api/settings/organization?key=dashboard_hidden_kpis")
        if (!res.ok) return
        const json = await res.json()
        const setting = Array.isArray(json.data) ? json.data[0] : null
        if (!setting?.value) return
        const ids = JSON.parse(setting.value) as string[]
        setHiddenKpis(new Set(ids.filter((id): id is DashboardKpiId =>
          ["sales", "margin", "debtors", "debt"].includes(id)
        )))
      } catch {
        // silent — default empty Set (all visible)
      }
    }
    loadHiddenKpis()
  }, [])

  const fetchDashboardData = useCallback(async () => {
    setLoading(true)
    setLoadingProgress(0)
    // Tracker de progreso: incrementa por cada fetch que termina (sea ok o error).
    // Total = 8 fetches del Promise.all. UI feedback puro.
    let completed = 0
    const TOTAL_FETCHES = 8
    const trackedFetch = async (url: string, opts?: RequestInit): Promise<Response> => {
      try {
        const res = await fetch(url, opts)
        return res
      } finally {
        completed += 1
        setLoadingProgress(Math.min(100, Math.round((completed / TOTAL_FETCHES) * 100)))
      }
    }
    try {
      const params = new URLSearchParams()
      params.set("dateFrom", filters.dateFrom)
      params.set("dateTo", filters.dateTo)
      if (filters.agencyId !== "ALL") {
        params.set("agencyId", filters.agencyId)
      }
      if (filters.sellerId !== "ALL") {
        params.set("sellerId", filters.sellerId)
      }

      // Calcular período anterior (mismo rango de días, antes)
      const dateFrom = new Date(filters.dateFrom)
      const dateTo = new Date(filters.dateTo)
      const daysDiff = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
      
      const prevDateTo = new Date(dateFrom)
      prevDateTo.setDate(prevDateTo.getDate() - 1)
      const prevDateFrom = new Date(prevDateTo)
      prevDateFrom.setDate(prevDateFrom.getDate() - daysDiff)
      
      const prevParams = new URLSearchParams()
      prevParams.set("dateFrom", prevDateFrom.toISOString().split("T")[0])
      prevParams.set("dateTo", prevDateTo.toISOString().split("T")[0])
      if (filters.agencyId !== "ALL") {
        prevParams.set("agencyId", filters.agencyId)
      }
      if (filters.sellerId !== "ALL") {
        prevParams.set("sellerId", filters.sellerId)
      }

      // Fetch en paralelo. Cache controlado por header Cache-Control de cada
      // endpoint (private, max-age=30, stale-while-revalidate=60). El botón
      // "Actualizar" del header re-monta el componente y fuerza re-fetch.
      const fetchOptions = {
        cache: "default" as RequestCache
      }
      
      // Deudores: llamamos directamente al endpoint /api/accounting/debts-sales
      // (mismo que la página Contabilidad → Deudores) y sumamos totalDebt en
      // cliente. Así garantizamos que el KPI coincida siempre con la tabla
      // que el user ya usa. /api/analytics/pending-balances queda solo para
      // accountsPayable (deuda a operadores).
      const debtsSalesSearchParams = new URLSearchParams()
      debtsSalesSearchParams.set("dateFrom", filters.dateFrom)
      debtsSalesSearchParams.set("dateTo", filters.dateTo)
      if (filters.sellerId && filters.sellerId !== "ALL") {
        debtsSalesSearchParams.set("sellerId", filters.sellerId)
      }

      const operatorsDebtParams = new URLSearchParams()
      operatorsDebtParams.set("dateFrom", filters.dateFrom)
      operatorsDebtParams.set("dateTo", filters.dateTo)
      if (filters.agencyId && filters.agencyId !== "ALL") {
        operatorsDebtParams.set("agencyId", filters.agencyId)
      }

      // PERF: usamos endpoints lightweight (RPC SUM SQL) para los 2 KPIs
      // pesados:
      //   - debts-sales-total   (~500ms vs ~9s del completo)
      //   - operator-debts-total (~500ms vs ~5s del pending-balances completo)
      // Si los nuevos fallaran, caemos automáticamente a los originales.
      const __perfFetchStart = performance.now()
      const __perfLog = process.env.NEXT_PUBLIC_PERF_LOG !== "0"
      const stamp = (name: string) => (res: Response) => {
        if (__perfLog) {
          // eslint-disable-next-line no-console
          console.log(`[perf:client] dashboard fetch ${name}: ${(performance.now() - __perfFetchStart).toFixed(0)}ms (status=${res.status})`)
        }
        return res
      }
      const [salesRes, sellersRes, destinationsRes, destinationsAllRes, cashflowRes, debtsTotalRes, operatorsDebtRes, prevSalesRes] = await Promise.all([
        trackedFetch(`/api/analytics/sales?${params.toString()}`, fetchOptions).then(stamp("sales")),
        trackedFetch(`/api/analytics/sellers?${params.toString()}`, fetchOptions).then(stamp("sellers")),
        trackedFetch(`/api/analytics/destinations?${params.toString()}&limit=5`, fetchOptions).then(stamp("destinations5")),
        trackedFetch(`/api/analytics/destinations?${params.toString()}&limit=10`, fetchOptions).then(stamp("destinations10")),
        trackedFetch(`/api/analytics/cashflow?${params.toString()}`, fetchOptions).then(stamp("cashflow")),
        trackedFetch(`/api/accounting/debts-sales-total?${debtsSalesSearchParams.toString()}`, fetchOptions).then(stamp("debts-sales-total")),
        trackedFetch(`/api/accounting/operator-debts-total?${operatorsDebtParams.toString()}`, fetchOptions).then(stamp("operator-debts-total")),
        trackedFetch(`/api/analytics/sales?${prevParams.toString()}`, fetchOptions).then(stamp("sales (prev period)")),
      ])
      if (__perfLog) {
        // eslint-disable-next-line no-console
        console.log(`[perf:client] dashboard ALL fetches DONE: ${(performance.now() - __perfFetchStart).toFixed(0)}ms`)
      }

      const salesData = salesRes.ok ? await salesRes.json() : { totalSales: 0, totalMargin: 0, operationsCount: 0, avgMarginPercent: 0 }
      const sellersData = sellersRes.ok ? await sellersRes.json() : { sellers: [] }
      const destinationsData = destinationsRes.ok ? await destinationsRes.json() : { destinations: [] }
      const destinationsAllData = destinationsAllRes.ok ? await destinationsAllRes.json() : { destinations: [] }
      const cashflowData = cashflowRes.ok ? await cashflowRes.json() : { cashflow: [] }
      // accountsPayable: primero el endpoint lightweight, si falla → fallback al pending-balances original.
      let operatorDebtUsd = 0
      if (operatorsDebtRes.ok) {
        try {
          const operatorTotalData = await operatorsDebtRes.json()
          if (typeof operatorTotalData?.totalUsd === "number") {
            operatorDebtUsd = operatorTotalData.totalUsd
          } else {
            throw new Error("unexpected shape")
          }
        } catch {
          operatorDebtUsd = NaN
        }
      } else {
        operatorDebtUsd = NaN
      }
      if (!Number.isFinite(operatorDebtUsd)) {
        try {
          const fallbackOperatorRes = await fetch(
            `/api/analytics/pending-balances?${operatorsDebtParams.toString()}`,
            fetchOptions
          )
          if (fallbackOperatorRes.ok) {
            const fallbackOperatorData = await fallbackOperatorRes.json()
            operatorDebtUsd = Number(fallbackOperatorData?.accountsPayable) || 0
          } else {
            operatorDebtUsd = 0
          }
        } catch {
          operatorDebtUsd = 0
        }
      }
      const operatorsDebtData = { accountsPayable: operatorDebtUsd }
      const prevSalesData = prevSalesRes.ok ? await prevSalesRes.json() : { totalSales: 0, totalMargin: 0, operationsCount: 0 }

      // Total de deuda por ventas (USD): primero el endpoint lightweight,
      // si falla → fallback al original con el .reduce viejo.
      let customerDebtUsd = 0
      if (debtsTotalRes.ok) {
        try {
          const debtsTotalData = await debtsTotalRes.json()
          if (typeof debtsTotalData?.totalUsd === "number") {
            customerDebtUsd = debtsTotalData.totalUsd
          } else {
            throw new Error("unexpected shape")
          }
        } catch {
          // Cae al fallback abajo
          customerDebtUsd = NaN
        }
      } else {
        customerDebtUsd = NaN
      }
      if (!Number.isFinite(customerDebtUsd)) {
        // Fallback automático al endpoint completo (lento pero funcional).
        try {
          const fallbackRes = await fetch(
            `/api/accounting/debts-sales?${debtsSalesSearchParams.toString()}`,
            fetchOptions
          )
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json()
            customerDebtUsd = ((fallbackData.debtors || []) as any[])
              .reduce((sum: number, d: any) => sum + (Number(d.totalDebt) || 0), 0)
          } else {
            customerDebtUsd = 0
          }
        } catch {
          customerDebtUsd = 0
        }
      }

      setPreviousKpis({
        totalSales: prevSalesData.totalSales || 0,
        totalMargin: prevSalesData.totalMargin || 0,
        operationsCount: prevSalesData.operationsCount || 0,
      })

      setKpis({
        totalSales: salesData.totalSales || 0,
        totalMargin: salesData.totalMargin || 0,
        operationsCount: salesData.operationsCount || 0,
        avgMarginPercent: salesData.avgMarginPercent || 0,
        pendingCustomerPayments: customerDebtUsd,
        pendingOperatorPayments: operatorsDebtData.accountsPayable || 0,
      })

      setSellersData(sellersData.sellers || [])
      setDestinationsData(destinationsData.destinations || [])
      setDestinationsAllData(destinationsAllData.destinations || [])
      setCashflowData(cashflowData.cashflow || [])
    } catch (error) {
      console.error("Error fetching dashboard data:", error)
    } finally {
      // Forzar 100% al cierre para que el bar no se quede estancado en
      // un valor intermedio si alguna fetch hizo throw antes del finally.
      setLoadingProgress(100)
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchDashboardData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.dateFrom, filters.dateTo, filters.agencyId, filters.sellerId])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Resumen</h1>
          <p className="text-xs text-muted-foreground">
            Vista general del negocio
          </p>
        </div>
        <Button onClick={fetchDashboardData} disabled={loading} variant="outline" size="sm" className="w-full sm:w-auto">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Progress bar de carga (paso C-1). UI-only, no afecta data. */}
      {loading && (
        <div className="space-y-1">
          <Progress value={loadingProgress} className="h-1" />
          <p className="text-[10px] text-muted-foreground tabular-nums">
            Cargando datos del resumen… {loadingProgress}%
          </p>
        </div>
      )}

      <DashboardFilters
        agencies={agencies}
        sellers={sellers}
        value={filters}
        defaultValue={defaultFilters}
        onChange={setFilters}
      />

      {/* KPIs - Stripe style */}
      <div className="flex items-center justify-between -mb-1">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">Indicadores</div>
        <KpiCustomizer hiddenKpis={hiddenKpis} onChange={setHiddenKpis} />
      </div>
      <div className={`grid gap-3 ${
        4 - hiddenKpis.size <= 1
          ? "grid-cols-1"
          : 4 - hiddenKpis.size === 2
            ? "grid-cols-1 md:grid-cols-2"
            : 4 - hiddenKpis.size === 3
              ? "grid-cols-2 md:grid-cols-3"
              : "grid-cols-2 md:grid-cols-4"
      }`}>
        {!hiddenKpis.has("sales") && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <p className="text-sm font-medium text-muted-foreground">Ventas</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Suma total de ventas de todas las operaciones confirmadas en el período seleccionado, convertidas a USD.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <ComparisonBadge current={kpis.totalSales} previous={previousKpis.totalSales} />
          </div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">${formatNumber(kpis.totalSales)}</p>
          {loading ? (
            <Skeleton className="h-3 w-16 mt-1" />
          ) : (
            <p className="text-xs text-muted-foreground mt-1">{kpis.operationsCount} operaciones</p>
          )}
        </Card>
        )}

        {!hiddenKpis.has("margin") && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <p className="text-sm font-medium text-muted-foreground">Margen</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Ganancia bruta: diferencia entre ventas y costos de operadores. Margen % es el porcentaje promedio de ganancia sobre las ventas.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <ComparisonBadge current={kpis.totalMargin} previous={previousKpis.totalMargin} />
          </div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">${formatNumber(kpis.totalMargin)}</p>
          {loading ? (
            <Skeleton className="h-3 w-16 mt-1" />
          ) : (
            <p className="text-xs text-muted-foreground mt-1">{kpis.avgMarginPercent.toFixed(1)}% promedio</p>
          )}
        </Card>
        )}

        {!hiddenKpis.has("debtors") && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <p className="text-sm font-medium text-muted-foreground">Deudores</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Total adeudado por clientes. Calculado como: monto de venta menos pagos recibidos, convertido a USD usando tipo de cambio histórico.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">${formatNumber(kpis.pendingCustomerPayments)}</p>
          {loading ? (
            <Skeleton className="h-3 w-20 mt-1" />
          ) : (
            <p className="text-xs text-muted-foreground mt-1">Por ventas</p>
          )}
        </Card>
        )}

        {!hiddenKpis.has("debt") && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <p className="text-sm font-medium text-muted-foreground">Deuda</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Total pendiente de pago a operadores. Incluye pagos parciales: monto total menos monto pagado, convertido a USD.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">${formatNumber(kpis.pendingOperatorPayments)}</p>
          {loading ? (
            <Skeleton className="h-3 w-20 mt-1" />
          ) : (
            <p className="text-xs text-muted-foreground mt-1">A operadores</p>
          )}
        </Card>
        )}
      </div>

      {/* Cumpleaños del día */}
      <BirthdaysTodayCard />

      {/* Tareas, Alertas, Próximos Viajes y Top Vendedores */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2 xl:grid-cols-4">
        <PendingTasksCard />
        <PendingAlertsCard agencyId={filters.agencyId} sellerId={filters.sellerId} />
        <UpcomingTripsCard agencyId={filters.agencyId} sellerId={filters.sellerId} />
        {!isSeller && (
          <TopSellersCard agencyId={filters.agencyId} sellerId={filters.sellerId} dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
        )}
      </div>

      {/* Charts */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
        {!isSeller && <SalesBySellerChart data={sellersData} />}
        <DestinationsChart data={destinationsData} />
      </div>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <DestinationsPieChart data={destinationsAllData} />
        <RegionsRadarChart data={destinationsAllData} />
        {!isSeller && (
          <div className="md:col-span-2 lg:col-span-2">
            <CashflowChart data={cashflowData} />
          </div>
        )}
      </div>
    </div>
  )
}

