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
import { BirthdaysTodayCard } from "./birthdays-today-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowUpIcon, ArrowDownIcon } from "@radix-ui/react-icons"
import { DollarSign, TrendingUp, Package, Percent, Users, Building2 } from "lucide-react"

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
    <div className="flex-1 space-y-4 pt-4 md:pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Dashboard</h2>
          <p className="text-xs text-muted-foreground">
            Vista general del negocio
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={fetchDashboardData} disabled={loading} variant="outline" size="sm" className="w-full sm:w-auto">
            Actualizar
          </Button>
        </div>
      </div>

      <DashboardFilters
        agencies={agencies}
        sellers={sellers}
        value={filters}
        defaultValue={defaultFilters}
        onChange={setFilters}
      />

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Ventas Totales
            </CardTitle>
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold lg:text-xl truncate">
                    ${formatNumber(kpis.totalSales)}
                  </span>
                  <ComparisonBadge current={kpis.totalSales} previous={previousKpis.totalSales} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {kpis.operationsCount} ops • vs anterior
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Operaciones
            </CardTitle>
            <Package className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold lg:text-xl">
                    {kpis.operationsCount}
                  </span>
                  <ComparisonBadge current={kpis.operationsCount} previous={previousKpis.operationsCount} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  vs período anterior
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Margen Total
            </CardTitle>
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold lg:text-xl truncate">
                    ${formatNumber(kpis.totalMargin)}
                  </span>
                  <ComparisonBadge current={kpis.totalMargin} previous={previousKpis.totalMargin} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {kpis.avgMarginPercent.toFixed(1)}% promedio
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Margen Promedio
            </CardTitle>
            <Percent className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <>
                <div className="text-lg font-bold lg:text-xl">
                  {kpis.avgMarginPercent.toFixed(1)}%
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Margen promedio
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Deudores por Ventas
            </CardTitle>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <>
                <div className="text-lg font-bold lg:text-xl truncate text-amber-600">
                  ${formatNumber(kpis.pendingCustomerPayments)}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Pendientes de clientes
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Deuda a Operadores
            </CardTitle>
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <>
                <div className="text-lg font-bold lg:text-xl truncate text-amber-600">
                  ${formatNumber(kpis.pendingOperatorPayments)}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Pendientes de operadores
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cumpleaños del día */}
      <BirthdaysTodayCard />

      {/* Alertas, Próximos Viajes y Top Vendedores */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <PendingAlertsCard agencyId={filters.agencyId} sellerId={filters.sellerId} />
        <UpcomingTripsCard agencyId={filters.agencyId} sellerId={filters.sellerId} />
        <TopSellersCard agencyId={filters.agencyId} sellerId={filters.sellerId} dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <SalesBySellerChart data={sellersData} />
        </Card>
        <Card>
          <DestinationsChart data={destinationsData} />
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card className="md:col-span-1 lg:col-span-1">
          <DestinationsPieChart data={destinationsAllData} />
        </Card>
        <Card className="md:col-span-1 lg:col-span-1">
          <RegionsRadarChart data={destinationsAllData} />
        </Card>
        <Card className="md:col-span-2 lg:col-span-2">
          <CashflowChart data={cashflowData} />
        </Card>
      </div>
    </div>
  )
}

