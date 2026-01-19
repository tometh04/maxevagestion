"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Users, Target, DollarSign, Percent, Instagram, MessageCircle, Megaphone, TrendingUp } from "lucide-react"
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
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { Label } from "@/components/ui/label"
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns"

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
  filters: {
    dateFrom: string
    dateTo: string
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

const getSourceIcon = (source: string) => {
  switch (source) {
    case 'Instagram':
      return <Instagram className="h-3 w-3" />
    case 'WhatsApp':
      return <MessageCircle className="h-3 w-3" />
    case 'Meta Ads':
      return <Megaphone className="h-3 w-3" />
    default:
      return null
  }
}

export function SalesStatisticsPageClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<SalesStatistics | null>(null)
  
  // Filtros de fecha
  const now = new Date()
  const defaultFrom = startOfMonth(subMonths(now, 11))
  const defaultTo = endOfMonth(now)
  
  const [dateFrom, setDateFrom] = useState<Date | undefined>(defaultFrom)
  const [dateTo, setDateTo] = useState<Date | undefined>(defaultTo)

  // Cargar cuando ambas fechas están seleccionadas (solo inicial)
  useEffect(() => {
    if (dateFrom && dateTo) {
      loadStatistics()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadStatistics = async () => {
    // Validar que ambas fechas estén seleccionadas
    if (!dateFrom || !dateTo) {
      return
    }

    // Validar que la fecha de fin sea después de la de inicio
    if (dateTo < dateFrom) {
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
      params.append("dateFrom", format(dateFrom, "yyyy-MM-dd"))
      params.append("dateTo", format(dateTo, "yyyy-MM-dd"))
      
      const response = await fetch(`/api/sales/statistics?${params.toString()}`)
      
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

  // Cargar cuando ambas fechas están seleccionadas (con debounce)
  useEffect(() => {
    if (dateFrom && dateTo && dateTo >= dateFrom) {
      const timeoutId = setTimeout(() => {
        loadStatistics()
      }, 500)
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo])

  const handleDateFromChange = (date: Date | undefined) => {
    setDateFrom(date)
    // Si la fecha de fin es anterior a la nueva fecha de inicio, resetear
    if (date && dateTo && dateTo < date) {
      setDateTo(undefined)
    }
  }

  const handleDateToChange = (date: Date | undefined) => {
    if (date && dateFrom && date < dateFrom) {
      toast({
        title: "Rango inválido",
        description: "La fecha de fin debe ser posterior a la fecha de inicio",
        variant: "destructive",
      })
      return
    }
    setDateTo(date)
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

  // Datos para gráfico de torta por origen
  const sourceDistribution = stats.distributions.bySource
    .filter(s => s.count > 0)
    .map(s => ({
      name: s.source,
      value: s.count,
      won: s.won,
      color: SOURCE_COLORS[s.source] || '#6b7280',
    }))

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList className="text-xs">
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/sales/leads">Ventas</Link>
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
            Métricas de ventas en USD
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Desde</Label>
              <DateInputWithCalendar
                value={dateFrom}
                onChange={handleDateFromChange}
                placeholder="dd/MM/yyyy"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hasta</Label>
              <DateInputWithCalendar
                value={dateTo}
                onChange={handleDateToChange}
                placeholder="dd/MM/yyyy"
                minDate={dateFrom}
              />
            </div>
          </div>
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
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Leads</p>
              <p className="text-base font-semibold">{stats.overview.totalLeads.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">{stats.overview.newThisMonth} nuevos</p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-orange-100 dark:bg-orange-900/30">
              <Target className="h-3.5 w-3.5 text-orange-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Activos</p>
              <p className="text-base font-semibold text-orange-600">{stats.overview.activeLeads}</p>
              <p className="text-[10px] text-muted-foreground">en proceso</p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded ${stats.overview.conversionRate >= 20 ? 'bg-green-100 dark:bg-green-900/30' : stats.overview.conversionRate >= 10 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              <Percent className={`h-3.5 w-3.5 ${stats.overview.conversionRate >= 20 ? 'text-green-600' : stats.overview.conversionRate >= 10 ? 'text-yellow-600' : 'text-red-600'}`} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Conversión</p>
              <p className={`text-base font-semibold ${stats.overview.conversionRate >= 20 ? 'text-green-600' : stats.overview.conversionRate >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                {stats.overview.conversionRate}%
              </p>
              <p className="text-[10px] text-muted-foreground">{stats.overview.wonLeads} ganados</p>
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-900/30">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Depósitos</p>
              <p className="text-base font-semibold text-emerald-600">{formatFullCurrency(stats.overview.totalDeposits)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Pipeline de ventas */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">Pipeline de Ventas</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid gap-3 md:grid-cols-5">
            {stats.pipeline.map((stage, index) => (
              <div key={stage.status} className="text-center">
                <div 
                  className="rounded-lg p-3 mb-2"
                  style={{ backgroundColor: `${PIPELINE_COLORS[index]}20` }}
                >
                  <div className="text-2xl font-bold" style={{ color: PIPELINE_COLORS[index] }}>
                    {stage.count}
                  </div>
                </div>
                <p className="text-xs font-medium">{stage.label}</p>
                {stage.value > 0 && (
                  <p className="text-[10px] text-muted-foreground">{formatCurrency(stage.value)}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid md:grid-cols-3 gap-3">
        {/* Tendencia por período */}
        <Card className="md:col-span-2">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">
              {dateFrom && dateTo && (() => {
                const days = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
                return days <= 31 ? "Tendencia de Leads por Día" : "Tendencia de Leads por Mes"
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.trends.monthly} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line 
                    type="monotone" 
                    dataKey="newLeads" 
                    name="Nuevos"
                    stroke="#f97316" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="wonLeads" 
                    name="Ganados"
                    stroke="#22c55e" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="lostLeads" 
                    name="Perdidos"
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Por origen */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Por Origen</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[200px]">
              {sourceDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {sourceDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11 }} />
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
        {/* Top vendedores */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Top Vendedores</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] h-7 px-2">#</TableHead>
                  <TableHead className="text-[10px] h-7 px-2">Vendedor</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Leads</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Conversión</TableHead>
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
                      {seller.leads}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right">
                      <span className={seller.conversionRate >= 25 ? "text-green-600" : seller.conversionRate >= 15 ? "text-amber-600" : "text-muted-foreground"}>
                        {seller.conversionRate.toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {stats.rankings.topSellers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">
                      Sin datos suficientes
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Rendimiento por origen */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">Rendimiento por Origen</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] h-7 px-2">Origen</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Leads</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Ganados</TableHead>
                  <TableHead className="text-[10px] h-7 px-2 text-right">Conversión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.rankings.topSources.map((source) => (
                  <TableRow key={source.source} className="hover:bg-muted/50">
                    <TableCell className="text-xs py-1.5 px-2 font-medium">
                      <div className="flex items-center gap-1.5">
                        {getSourceIcon(source.source)}
                        <span className="truncate max-w-[100px]">{source.source}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right tabular-nums">
                      {source.count}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right tabular-nums">
                      {(source as any).won || 0}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 px-2 text-right">
                      <span className={source.conversionRate >= 25 ? "text-green-600" : source.conversionRate >= 15 ? "text-amber-600" : "text-muted-foreground"}>
                        {source.conversionRate.toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {stats.rankings.topSources.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">
                      Sin datos
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
        <span>{stats.overview.activeLeads} activos • {stats.overview.wonLeads} ganados • {stats.overview.lostLeads} perdidos</span>
        <span>Total depósitos: {formatFullCurrency(stats.overview.totalDeposits)}</span>
      </div>
    </div>
  )
}
