"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Users, TrendingUp, Target, UserCheck, DollarSign, Download, Percent, Instagram, MessageCircle, Megaphone } from "lucide-react"
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
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts"

interface SalesStatistics {
  overview: {
    totalLeads: number
    activeLeads: number
    wonLeads: number
    lostLeads: number
    conversionRate: number
    totalDeposits: number
    newThisMonth: number
  }
  pipeline: Array<{
    status: string
    label: string
    count: number
    value: number
  }>
  distributions: {
    bySource: Array<{
      source: string
      count: number
      won: number
      conversionRate: number
    }>
    byRegion: Array<{
      region: string
      count: number
      won: number
    }>
    bySeller: Array<{
      id: string
      name: string
      leads: number
      won: number
      conversionRate: number
    }>
  }
  trends: {
    monthly: Array<{
      month: string
      monthName: string
      newLeads: number
      wonLeads: number
      lostLeads: number
    }>
  }
  rankings: {
    topSellers: Array<{
      id: string
      name: string
      leads: number
      won: number
      conversionRate: number
    }>
    topSources: Array<{
      source: string
      count: number
      conversionRate: number
    }>
  }
}

const PIPELINE_COLORS = ['#f97316', '#fb923c', '#fbbf24', '#22c55e', '#ef4444']
const SOURCE_COLORS: Record<string, string> = {
  Instagram: '#E1306C',
  WhatsApp: '#25D366',
  'Meta Ads': '#1877F2',
  Otro: '#6b7280',
}

const REGION_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b']

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)
}

const getSourceIcon = (source: string) => {
  switch (source) {
    case 'Instagram':
      return <Instagram className="h-4 w-4" />
    case 'WhatsApp':
      return <MessageCircle className="h-4 w-4" />
    case 'Meta Ads':
      return <Megaphone className="h-4 w-4" />
    default:
      return null
  }
}

export function SalesStatisticsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<SalesStatistics | null>(null)
  const [months, setMonths] = useState("12")

  useEffect(() => {
    loadStatistics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months])

  const loadStatistics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/sales/statistics?months=${months}`)
      
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
              <Link href="/sales/leads">Ventas</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Estadísticas</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Estadísticas de Ventas</h1>
          <p className="text-muted-foreground">
            Pipeline de ventas, conversión y performance del equipo
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
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.overview.totalLeads.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.overview.newThisMonth} nuevos este mes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activos</CardTitle>
            <Target className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.overview.activeLeads}</div>
            <p className="text-xs text-muted-foreground">
              en proceso de venta
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Conversión</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.overview.conversionRate >= 20 ? 'text-green-600' : stats.overview.conversionRate >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
              {stats.overview.conversionRate}%
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.overview.wonLeads} ganados / {stats.overview.lostLeads} perdidos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Depósitos</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.overview.totalDeposits)}</div>
            <p className="text-xs text-muted-foreground">
              total en depósitos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline de ventas */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline de Ventas</CardTitle>
          <CardDescription>Distribución de leads por etapa</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            {stats.pipeline.map((stage, index) => (
              <div key={stage.status} className="text-center">
                <div 
                  className="rounded-lg p-4 mb-2"
                  style={{ backgroundColor: `${PIPELINE_COLORS[index]}20` }}
                >
                  <div className="text-3xl font-bold" style={{ color: PIPELINE_COLORS[index] }}>
                    {stage.count}
                  </div>
                </div>
                <p className="font-medium">{stage.label}</p>
                {stage.value > 0 && (
                  <p className="text-xs text-muted-foreground">{formatCurrency(stage.value)}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Tendencia mensual */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Tendencia de Leads</CardTitle>
            <CardDescription>Evolución mensual de nuevos leads y conversiones</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.trends.monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="monthName" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="newLeads" 
                    name="Nuevos"
                    stroke="#f97316" 
                    strokeWidth={2}
                    dot={{ fill: '#f97316' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="wonLeads" 
                    name="Ganados"
                    stroke="#22c55e" 
                    strokeWidth={2}
                    dot={{ fill: '#22c55e' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="lostLeads" 
                    name="Perdidos"
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={{ fill: '#ef4444' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Por origen */}
        <Card>
          <CardHeader>
            <CardTitle>Por Origen</CardTitle>
            <CardDescription>Leads y conversión por canal de origen</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.distributions.bySource}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="source" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" name="Leads" fill="#3b82f6" />
                  <Bar yAxisId="left" dataKey="won" name="Ganados" fill="#22c55e" />
                  <Line yAxisId="right" type="monotone" dataKey="conversionRate" name="Conversión %" stroke="#f97316" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Por región */}
        <Card>
          <CardHeader>
            <CardTitle>Por Región</CardTitle>
            <CardDescription>Distribución de leads por destino</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.distributions.byRegion}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ region, percent }) => `${region}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {stats.distributions.byRegion.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={REGION_COLORS[index % REGION_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rankings */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top vendedores */}
        <Card>
          <CardHeader>
            <CardTitle>Top Vendedores</CardTitle>
            <CardDescription>Mejor tasa de conversión (mín. 5 leads)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Conversión</TableHead>
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
                    <TableCell className="text-right">{seller.leads}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={seller.conversionRate >= 25 ? "default" : seller.conversionRate >= 15 ? "secondary" : "outline"}>
                        {seller.conversionRate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {stats.rankings.topSellers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No hay datos suficientes
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Rendimiento por origen */}
        <Card>
          <CardHeader>
            <CardTitle>Rendimiento por Origen</CardTitle>
            <CardDescription>Efectividad de cada canal</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Origen</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Ganados</TableHead>
                  <TableHead className="text-right">Conversión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.rankings.topSources.map((source) => (
                  <TableRow key={source.source}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {getSourceIcon(source.source)}
                        {source.source}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{source.count}</TableCell>
                    <TableCell className="text-right">{(source as any).won || 0}</TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        style={{ 
                          backgroundColor: `${SOURCE_COLORS[source.source] || '#6b7280'}20`,
                          color: SOURCE_COLORS[source.source] || '#6b7280'
                        }}
                      >
                        {source.conversionRate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
