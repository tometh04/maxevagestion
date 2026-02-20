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
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowUpIcon, ArrowDownIcon } from "@radix-ui/react-icons"
import { DollarSign, TrendingUp, Package, Percent, Users, Building2, HelpCircle } from "lucide-react"
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
    <span className={`inline-flex items-center text-[10px] font-medium whitespace-nowrap ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
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
}: DashboardPageClientProps) {
  const [filters, setFilters] = useState(defaultFilters)
  const [loading, setLoading] = useState(false)
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

  const fetchDashboardData = useCallback(async () => {
    setLoading(true)
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

      // Fetch all data in parallel with cache headers
      const fetchOptions = { 
        next: { revalidate: 30 } // Cache por 30 segundos
      }
      
      // Agregar agencyId al endpoint de pending-balances si está seleccionado
      const pendingBalancesParams = filters.agencyId && filters.agencyId !== "ALL" 
        ? `?agencyId=${filters.agencyId}` 
        : ""
      
      const [salesRes, sellersRes, destinationsRes, destinationsAllRes, cashflowRes, pendingBalancesRes, prevSalesRes] = await Promise.all([
        fetch(`/api/analytics/sales?${params.toString()}`, fetchOptions),
        fetch(`/api/analytics/sellers?${params.toString()}`, fetchOptions),
        fetch(`/api/analytics/destinations?${params.toString()}&limit=5`, fetchOptions),
        fetch(`/api/analytics/destinations?${params.toString()}&limit=10`, fetchOptions),
        fetch(`/api/analytics/cashflow?${params.toString()}`, fetchOptions),
        fetch(`/api/analytics/pending-balances${pendingBalancesParams}`, fetchOptions),
        fetch(`/api/analytics/sales?${prevParams.toString()}`, fetchOptions),
      ])

      const salesData = await salesRes.json()
      const sellersData = await sellersRes.json()
      const destinationsData = await destinationsRes.json()
      const destinationsAllData = await destinationsAllRes.json()
      const cashflowData = await cashflowRes.json()
      const pendingBalancesData = await pendingBalancesRes.json()
      const prevSalesData = await prevSalesRes.json()

      // Guardar datos del período anterior para comparativa
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
        pendingCustomerPayments: pendingBalancesData.accountsReceivable || 0,
        pendingOperatorPayments: pendingBalancesData.accountsPayable || 0,
      })

      setSellersData(sellersData.sellers || [])
      setDestinationsData(destinationsData.destinations || [])
      setDestinationsAllData(destinationsAllData.destinations || [])
      setCashflowData(cashflowData.cashflow || [])
    } catch (error) {
      console.error("Error fetching dashboard data:", error)
    } finally {
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
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Vista general del negocio
          </p>
        </div>
        <Button onClick={fetchDashboardData} disabled={loading} variant="outline" size="sm" className="w-full sm:w-auto">
          Actualizar
        </Button>
      </div>

      <DashboardFilters
        agencies={agencies}
        sellers={sellers}
        value={filters}
        defaultValue={defaultFilters}
        onChange={setFilters}
      />

      {/* KPIs compactos - estilo estadísticas de clientes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-blue-100 dark:bg-blue-900/30">
              <DollarSign className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ventas</p>
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
              <p className="text-base font-semibold">${formatNumber(kpis.totalSales)}</p>
              {loading ? (
                <Skeleton className="h-3 w-16 mt-0.5" />
              ) : (
                <p className="text-[10px] text-muted-foreground">{kpis.operationsCount} ops</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Margen</p>
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
              <p className="text-base font-semibold text-emerald-600">${formatNumber(kpis.totalMargin)}</p>
              {loading ? (
                <Skeleton className="h-3 w-16 mt-0.5" />
              ) : (
                <p className="text-[10px] text-muted-foreground">{kpis.avgMarginPercent.toFixed(1)}% promedio</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-amber-100 dark:bg-amber-900/30">
              <Users className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Deudores</p>
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
              <p className="text-base font-semibold text-amber-600">${formatNumber(kpis.pendingCustomerPayments)}</p>
              {loading ? (
                <Skeleton className="h-3 w-20 mt-0.5" />
              ) : (
                <p className="text-[10px] text-muted-foreground">Por ventas</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-purple-100 dark:bg-purple-900/30">
              <Building2 className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Deuda</p>
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
              <p className="text-base font-semibold text-purple-600">${formatNumber(kpis.pendingOperatorPayments)}</p>
              {loading ? (
                <Skeleton className="h-3 w-20 mt-0.5" />
              ) : (
                <p className="text-[10px] text-muted-foreground">A operadores</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Cumpleaños del día */}
      <BirthdaysTodayCard />

      {/* Tareas, Alertas, Próximos Viajes y Top Vendedores */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2 xl:grid-cols-4">
        <PendingTasksCard />
        <PendingAlertsCard agencyId={filters.agencyId} sellerId={filters.sellerId} />
        <UpcomingTripsCard agencyId={filters.agencyId} sellerId={filters.sellerId} />
        <TopSellersCard agencyId={filters.agencyId} sellerId={filters.sellerId} dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
      </div>

      {/* Charts */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
        <SalesBySellerChart data={sellersData} />
        <DestinationsChart data={destinationsData} />
      </div>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <DestinationsPieChart data={destinationsAllData} />
        <RegionsRadarChart data={destinationsAllData} />
        <div className="md:col-span-2 lg:col-span-2">
          <CashflowChart data={cashflowData} />
        </div>
      </div>
    </div>
  )
}

