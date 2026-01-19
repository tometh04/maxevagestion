"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, TrendingUp, DollarSign, Users, MapPin } from "lucide-react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
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
  Legend,
} from "recharts"
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns"

interface OperationStatistics {
  overview: {
    totalOperations: number
    confirmedOperations: number
    totalSales: number
    totalMargin: number
    totalCollected: number
    totalDebt: number
    avgMarginPercentage: number
    avgTicket: number
  }
  trends: {
    monthly: Array<{
      month: string
      monthName: string
      count: number
      sales: number
      margin: number
      collected: number
    }>
  }
  rankings: {
    topDestinations: Array<{
      destination: string
      count: number
      totalSales: number
      totalMargin: number
      avgMargin: number
    }>
    topSellers: Array<{
      id: string
      name: string
      count: number
      sales: number
      margin: number
    }>
  }
  filters: {
    dateFrom: string
    dateTo: string
  }
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

const COLORS = {
  sales: '#3b82f6',
  margin: '#10b981',
  collected: '#22c55e',
  debt: '#ef4444',
}

export function OperationsStatisticsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<OperationStatistics | null>(null)
  
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
      toast({
        title: "Fechas requeridas",
        description: "Debes seleccionar una fecha de inicio y una fecha de fin",
        variant: "destructive",
      })
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
      
      const response = await fetch(`/api/operations/statistics?${params.toString()}`)
      
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

  // Datos para gráfico de torta (Cobrado vs Deuda)
  const paymentDistribution = stats ? [
    { name: 'Cobrado', value: stats.overview.totalCollected, color: COLORS.collected },
    { name: 'Pendiente', value: stats.overview.totalDebt, color: COLORS.debt },
  ].filter(d => d.value > 0) : []

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
              <Link href="/operations">Operaciones</Link>
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
            Métricas de operaciones en USD
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
              <DollarSign className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ventas</p>
              <p className="text-base font-semibold">{formatFullCurrency(stats.overview.totalSales)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-green-100 dark:bg-green-900/30">
              <TrendingUp className="h-3.5 w-3.5 text-green-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Margen</p>
              <p className="text-base font-semibold text-green-600">{formatFullCurrency(stats.overview.totalMargin)}</p>
              <p className="text-[10px] text-muted-foreground">{stats.overview.avgMarginPercentage}%</p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Cobrado</p>
              <p className="text-base font-semibold text-emerald-600">{formatFullCurrency(stats.overview.totalCollected)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-red-100 dark:bg-red-900/30">
              <DollarSign className="h-3.5 w-3.5 text-red-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pendiente</p>
              <p className="text-base font-semibold text-red-600">{formatFullCurrency(stats.overview.totalDebt)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid md:grid-cols-3 gap-3">
        {/* Tendencia mensual */}
        <Card className="md:col-span-2">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Ventas por Mes</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.trends.monthly} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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
                    tickFormatter={(value) => formatCurrency(value)}
                  />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      formatFullCurrency(value),
                      name === 'sales' ? 'Ventas' : name === 'margin' ? 'Margen' : 'Cobrado'
                    ]}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="sales" name="Ventas" fill={COLORS.sales} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="margin" name="Margen" fill={COLORS.margin} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Cobrado vs Pendiente */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Cobranza</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[200px]">
              {paymentDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {paymentDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => formatFullCurrency(value)}
                      contentStyle={{ fontSize: 11 }}
                    />
                    <Legend 
                      wrapperStyle={{ fontSize: 10 }}
                      formatter={(value) => <span className="text-xs">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Sin datos
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rankings */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Top Destinos */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Top Destinos</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] h-7 px-2">#</TableHead>
                  <TableHead className="text-[10px] h-7 px-2">Destino</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Ventas</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.rankings.topDestinations.slice(0, 8).map((dest, index) => (
                  <TableRow key={dest.destination} className="hover:bg-muted/50">
                    <TableCell className="text-xs py-1.5 px-2">
                      <Badge variant={index < 3 ? "default" : "outline"} className="h-5 w-5 p-0 justify-center text-[10px]">
                        {index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 font-medium truncate max-w-[120px]">
                      {dest.destination}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right tabular-nums">
                      {formatCurrency(dest.totalSales)}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right">
                      <span className={dest.avgMargin >= 15 ? "text-green-600" : dest.avgMargin >= 10 ? "text-amber-600" : "text-muted-foreground"}>
                        {dest.avgMargin.toFixed(0)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {stats.rankings.topDestinations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">
                      Sin datos de destinos
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top Vendedores */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Top Vendedores</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] h-7 px-2">#</TableHead>
                  <TableHead className="text-[10px] h-7 px-2">Vendedor</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Ventas</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Ops</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.rankings.topSellers.map((seller, index) => (
                  <TableRow key={seller.id} className="hover:bg-muted/50">
                    <TableCell className="text-xs py-1.5 px-2">
                      <Badge variant={index < 3 ? "default" : "outline"} className="h-5 w-5 p-0 justify-center text-[10px]">
                        {index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 font-medium truncate max-w-[120px]">
                      {seller.name}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right tabular-nums">
                      {formatCurrency(seller.sales)}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right tabular-nums">
                      {seller.count}
                    </TableCell>
                  </TableRow>
                ))}
                {stats.rankings.topSellers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">
                      Sin datos de vendedores
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
        <span>{stats.overview.totalOperations} operaciones • {stats.overview.confirmedOperations} confirmadas</span>
        <span>Ticket promedio: {formatFullCurrency(stats.overview.avgTicket)}</span>
      </div>
    </div>
  )
}
