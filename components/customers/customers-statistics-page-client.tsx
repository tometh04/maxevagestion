"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Users, TrendingUp, TrendingDown, DollarSign, UserCheck, UserX } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns"

interface CustomerStatistics {
  overview: {
    totalCustomers: number
    activeCustomers: number
    inactiveCustomers: number
    newThisMonth: number
    growthPercentage: number
    totalSpent: number
    avgSpentPerCustomer: number
    avgOperationsPerCustomer: number
  }
  trends: {
    newCustomersByMonth: Array<{
      month: string
      monthName: string
      count: number
    }>
  }
  distributions: {
    spendingRanges: Array<{
      range: string
      count: number
    }>
    activeVsInactive: Array<{
      name: string
      value: number
    }>
  }
  rankings: {
    topBySpending: Array<{
      id: string
      name: string
      totalSpent: number
      totalOperations: number
    }>
    topByFrequency: Array<{
      id: string
      name: string
      totalOperations: number
      totalSpent: number
    }>
  }
  filters: {
    dateFrom: string
    dateTo: string
  }
}

const COLORS = {
  active: '#10b981',
  inactive: '#ef4444',
  new: '#3b82f6',
}

const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`
  }
  return `$${value.toFixed(0)}`
}

const formatFullCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function CustomersStatisticsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<CustomerStatistics | null>(null)
  
  // Filtros de fecha
  const now = new Date()
  const defaultFrom = format(startOfMonth(subMonths(now, 11)), "yyyy-MM-dd")
  const defaultTo = format(endOfMonth(now), "yyyy-MM-dd")
  
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)

  useEffect(() => {
    // Solo cargar si hay ambas fechas
    if (dateFrom && dateTo) {
      loadStatistics()
    }
  }, [])

  const loadStatistics = async () => {
    // Validar que ambas fechas estén seleccionadas
    if (!dateFrom || !dateTo) {
      return
    }

    // Validar que la fecha de fin sea después de la de inicio
    if (new Date(dateTo) < new Date(dateFrom)) {
      toast({
        title: "Rango inválido",
        description: "La fecha de fin debe ser posterior a la fecha de inicio",
        variant: "destructive",
      })
      return
    }

    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.append("dateFrom", dateFrom)
      params.append("dateTo", dateTo)
      
      const response = await fetch(`/api/customers/statistics?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error('Error al cargar estadísticas')
      }

      const data = await response.json()
      setStats(data)
    } catch (error: any) {
      console.error('Error loading statistics:', error)
      toast({
        title: "Error",
        description: error.message || "No se pudieron cargar las estadísticas",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDateRangeChange = (from: string, to: string) => {
    setDateFrom(from)
    setDateTo(to)
    // Solo actualizar cuando ambas fechas estén seleccionadas
    if (from && to) {
      // Validar que la fecha de fin sea después de la de inicio
      if (new Date(to) < new Date(from)) {
        toast({
          title: "Rango inválido",
          description: "La fecha de fin debe ser posterior a la fecha de inicio",
          variant: "destructive",
        })
        return
      }
      // Usar un pequeño delay para asegurar que el estado se actualice
      setTimeout(() => {
        loadStatistics()
      }, 100)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <p className="text-sm text-muted-foreground">No se encontraron estadísticas</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList className="text-xs">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/customers">Clientes</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Estadísticas</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header con filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Estadísticas</h1>
          <p className="text-xs text-muted-foreground">
            Métricas de clientes en USD
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={handleDateRangeChange}
            placeholder="Seleccionar rango de fechas"
          />
        </div>
      </div>

      {/* KPIs compactos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
              <p className="text-base font-semibold">{stats.overview.totalCustomers.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">{stats.overview.newThisMonth} nuevos</p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded ${stats.overview.growthPercentage >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              {stats.overview.growthPercentage >= 0 ? (
                <TrendingUp className={`h-3.5 w-3.5 ${stats.overview.growthPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-600" />
              )}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Crecimiento</p>
              <p className={`text-base font-semibold ${stats.overview.growthPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.overview.growthPercentage >= 0 ? '+' : ''}{stats.overview.growthPercentage}%
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gasto Total</p>
              <p className="text-base font-semibold text-emerald-600">{formatFullCurrency(stats.overview.totalSpent)}</p>
              <p className="text-[10px] text-muted-foreground">Prom: {formatFullCurrency(stats.overview.avgSpentPerCustomer)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-purple-100 dark:bg-purple-900/30">
              <Users className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ops Prom.</p>
              <p className="text-base font-semibold text-purple-600">{stats.overview.avgOperationsPerCustomer.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">viajes por cliente</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid md:grid-cols-3 gap-3">
        {/* Nuevos clientes por mes */}
        <Card className="md:col-span-2">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Nuevos Clientes por Mes</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.trends.newCustomersByMonth} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="monthName" 
                    tick={{ fontSize: 10 }} 
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    tickLine={false}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <Tooltip 
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="count" name="Nuevos" fill={COLORS.new} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Activos vs Inactivos */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Estado</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.distributions.activeVsInactive.filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {stats.distributions.activeVsInactive.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.name === "Activos" ? COLORS.active : COLORS.inactive} 
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: 10 }}
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-3 mt-2 text-xs">
              <div className="flex items-center gap-1">
                <UserCheck className="h-3 w-3 text-green-600" />
                <span>{stats.overview.activeCustomers} activos</span>
              </div>
              <div className="flex items-center gap-1">
                <UserX className="h-3 w-3 text-red-600" />
                <span>{stats.overview.inactiveCustomers} inactivos</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rankings */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Top por gasto */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Top por Gasto</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] h-7 px-2">#</TableHead>
                  <TableHead className="text-[10px] h-7 px-2">Cliente</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Gasto</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Viajes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.rankings.topBySpending.slice(0, 8).map((customer, index) => (
                  <TableRow key={customer.id} className="hover:bg-muted/50">
                    <TableCell className="text-xs py-1.5 px-2">
                      <Badge variant={index < 3 ? "default" : "outline"} className="h-5 w-5 p-0 justify-center text-[10px]">
                        {index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 font-medium truncate max-w-[120px]">
                      {customer.name}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right tabular-nums">
                      {formatCurrency(customer.totalSpent)}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right tabular-nums">
                      {customer.totalOperations}
                    </TableCell>
                  </TableRow>
                ))}
                {stats.rankings.topBySpending.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">
                      Sin datos de clientes
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top por frecuencia */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Top por Frecuencia</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] h-7 px-2">#</TableHead>
                  <TableHead className="text-[10px] h-7 px-2">Cliente</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Viajes</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Gasto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.rankings.topByFrequency.slice(0, 8).map((customer, index) => (
                  <TableRow key={customer.id} className="hover:bg-muted/50">
                    <TableCell className="text-xs py-1.5 px-2">
                      <Badge variant={index < 3 ? "default" : "outline"} className="h-5 w-5 p-0 justify-center text-[10px]">
                        {index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 font-medium truncate max-w-[120px]">
                      {customer.name}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right tabular-nums">
                      {customer.totalOperations}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right tabular-nums">
                      {formatCurrency(customer.totalSpent)}
                    </TableCell>
                  </TableRow>
                ))}
                {stats.rankings.topByFrequency.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">
                      Sin datos de clientes
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Info adicional */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
        <span>{stats.overview.activeCustomers} activos • {stats.overview.inactiveCustomers} inactivos</span>
        <span>Total gastado: {formatFullCurrency(stats.overview.totalSpent)}</span>
      </div>
    </div>
  )
}
