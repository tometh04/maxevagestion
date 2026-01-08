"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plane, TrendingUp, DollarSign, Target, Calendar, BarChart3, Download, Percent } from "lucide-react"
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
  AreaChart,
  Area,
} from "recharts"

interface OperationStatistics {
  overview: {
    totalOperations: number
    confirmedOperations: number
    pendingOperations: number
    cancelledOperations: number
    totalSales: number
    totalMargin: number
    avgMarginPercentage: number
    avgTicket: number
    conversionRate: number
  }
  distributions: {
    byStatus: Array<{
      status: string
      label: string
      count: number
    }>
    byDestination: Array<{
      destination: string
      count: number
      totalSales: number
      totalMargin: number
      avgMargin: number
    }>
  }
  trends: {
    monthly: Array<{
      month: string
      monthName: string
      count: number
      sales: number
      margin: number
    }>
  }
  rankings: {
    topDestinations: Array<{
      destination: string
      count: number
      totalSales: number
      totalMargin: number
    }>
    topSellers: Array<{
      id: string
      name: string
      count: number
      sales: number
      margin: number
    }>
  }
}

const STATUS_COLORS: Record<string, string> = {
  PRE_RESERVATION: '#94a3b8',
  RESERVED: '#3b82f6',
  CONFIRMED: '#10b981',
  CANCELLED: '#ef4444',
  TRAVELLED: '#8b5cf6',
  CLOSED: '#64748b',
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)
}

export function OperationsStatisticsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<OperationStatistics | null>(null)
  const [months, setMonths] = useState("12")

  useEffect(() => {
    loadStatistics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months])

  const loadStatistics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/operations/statistics?months=${months}`)
      
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">No se encontraron estadísticas</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/operations">Operaciones</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Estadísticas</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Estadísticas de Operaciones</h1>
          <p className="text-muted-foreground">
            Análisis de rendimiento y métricas de operaciones
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Últimos 3 meses</SelectItem>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
              <SelectItem value="24">Últimos 24 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Cards de resumen */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Operaciones</CardTitle>
            <Plane className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.overview.totalOperations.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.overview.confirmedOperations} confirmadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ventas Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.overview.totalSales)}</div>
            <p className="text-xs text-muted-foreground">
              Ticket promedio: {formatCurrency(stats.overview.avgTicket)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Margen Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.overview.totalMargin)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.overview.avgMarginPercentage}% margen promedio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Conversión</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.overview.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.overview.pendingOperations} pendientes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Tendencia mensual */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Tendencia Mensual</CardTitle>
            <CardDescription>Evolución de ventas y margen por mes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.trends.monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="monthName" />
                  <YAxis yAxisId="left" tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`} />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      name === 'count' ? value : formatCurrency(value),
                      name === 'sales' ? 'Ventas' : name === 'margin' ? 'Margen' : 'Operaciones'
                    ]}
                  />
                  <Legend />
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="sales" 
                    name="Ventas"
                    stroke="#3b82f6" 
                    fill="#3b82f6"
                    fillOpacity={0.3}
                  />
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="margin" 
                    name="Margen"
                    stroke="#10b981" 
                    fill="#10b981"
                    fillOpacity={0.3}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="count" 
                    name="Operaciones"
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    dot={{ fill: '#8b5cf6' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Distribución por estado */}
        <Card>
          <CardHeader>
            <CardTitle>Por Estado</CardTitle>
            <CardDescription>Distribución de operaciones por estado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.distributions.byStatus.filter(s => s.count > 0)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ label, percent }) => `${label}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {stats.distributions.byStatus.map((entry) => (
                      <Cell key={`cell-${entry.status}`} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top destinos */}
        <Card>
          <CardHeader>
            <CardTitle>Top Destinos</CardTitle>
            <CardDescription>Destinos con mayor facturación</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.rankings.topDestinations.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`} />
                  <YAxis dataKey="destination" type="category" width={100} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="totalSales" name="Ventas" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rankings */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top destinos detallado */}
        <Card>
          <CardHeader>
            <CardTitle>Destinos Más Rentables</CardTitle>
            <CardDescription>Top 10 destinos por ventas y margen</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Margen %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.rankings.topDestinations.slice(0, 10).map((dest, index) => (
                  <TableRow key={dest.destination}>
                    <TableCell>
                      <Badge variant={index < 3 ? "default" : "outline"}>
                        {index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{dest.destination}</TableCell>
                    <TableCell className="text-right">{formatCurrency(dest.totalSales)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={dest.avgMargin >= 15 ? "default" : dest.avgMargin >= 10 ? "secondary" : "outline"}>
                        {dest.avgMargin.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {stats.rankings.topDestinations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No hay datos disponibles
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top vendedores */}
        <Card>
          <CardHeader>
            <CardTitle>Top Vendedores</CardTitle>
            <CardDescription>Mejores vendedores por facturación</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Ops</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.rankings.topSellers.map((seller, index) => (
                  <TableRow key={seller.id}>
                    <TableCell>
                      <Badge variant={index < 3 ? "default" : "outline"}>
                        {index + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{seller.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(seller.sales)}</TableCell>
                    <TableCell className="text-right">{seller.count}</TableCell>
                  </TableRow>
                ))}
                {stats.rankings.topSellers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No hay datos disponibles
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
