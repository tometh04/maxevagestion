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
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowUpIcon, ArrowDownIcon } from "@radix-ui/react-icons"
import { DollarSign, TrendingUp, Package, Percent, Users, Building2 } from "lucide-react"

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

      // Fetch all data in parallel with cache headers
      const fetchOptions = { 
        next: { revalidate: 30 } // Cache por 30 segundos
      }
      
      const [salesRes, sellersRes, destinationsRes, destinationsAllRes, cashflowRes, paymentsRes] = await Promise.all([
        fetch(`/api/analytics/sales?${params.toString()}`, fetchOptions),
        fetch(`/api/analytics/sellers?${params.toString()}`, fetchOptions),
        fetch(`/api/analytics/destinations?${params.toString()}&limit=5`, fetchOptions),
        fetch(`/api/analytics/destinations?${params.toString()}&limit=10`, fetchOptions),
        fetch(`/api/analytics/cashflow?${params.toString()}`, fetchOptions),
        fetch(`/api/payments?${params.toString()}&status=PENDING`, fetchOptions),
      ])

      const salesData = await salesRes.json()
      const sellersData = await sellersRes.json()
      const destinationsData = await destinationsRes.json()
      const destinationsAllData = await destinationsAllRes.json()
      const cashflowData = await cashflowRes.json()
      const paymentsData = await paymentsRes.json()

      setKpis({
        totalSales: salesData.totalSales || 0,
        totalMargin: salesData.totalMargin || 0,
        operationsCount: salesData.operationsCount || 0,
        avgMarginPercent: salesData.avgMarginPercent || 0,
        pendingCustomerPayments:
          (paymentsData.payments || [])
            .filter((p: any) => p.direction === "INCOME" && p.status === "PENDING")
            .reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0,
        pendingOperatorPayments:
          (paymentsData.payments || [])
            .filter((p: any) => p.direction === "EXPENSE" && p.status === "PENDING")
            .reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0,
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
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h2>
          <p className="text-sm text-muted-foreground sm:text-base">
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
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ventas Totales
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-xl font-bold sm:text-2xl break-words">
                  ${kpis.totalSales.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {kpis.operationsCount} operaciones
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Operaciones
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-xl font-bold sm:text-2xl">
                  {kpis.operationsCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  Operaciones realizadas
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Margen Total
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-xl font-bold sm:text-2xl break-words">
                  ${kpis.totalMargin.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {kpis.avgMarginPercent.toFixed(1)}% promedio
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Margen Promedio
            </CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-xl font-bold sm:text-2xl">
                  {kpis.avgMarginPercent.toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Margen promedio
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pendientes Clientes
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-xl font-bold sm:text-2xl break-words">
                  ${kpis.pendingCustomerPayments.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pagos pendientes de clientes
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pendientes Operadores
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-xl font-bold sm:text-2xl break-words">
                  ${kpis.pendingOperatorPayments.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pagos pendientes a operadores
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alertas y Próximos Viajes */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <PendingAlertsCard />
        <UpcomingTripsCard />
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

