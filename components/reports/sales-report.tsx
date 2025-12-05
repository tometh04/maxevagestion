"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Download, Loader2, Users } from "lucide-react"
import { toast } from "sonner"
import { format, subDays, startOfMonth, endOfMonth } from "date-fns"
import { es } from "date-fns/locale"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

interface SalesReportProps {
  userRole: string
  userId: string
  sellers: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
}

export function SalesReport({ userRole, userId, sellers, agencies }: SalesReportProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  
  // Filtros
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"))
  const [sellerId, setSellerId] = useState("ALL")
  const [agencyId, setAgencyId] = useState("ALL")
  const [groupBy, setGroupBy] = useState("day")

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        sellerId,
        agencyId,
        groupBy,
      })
      
      const res = await fetch(`/api/reports/sales?${params}`)
      const result = await res.json()
      
      if (result.error) {
        throw new Error(result.error)
      }
      
      setData(result)
    } catch (error: any) {
      toast.error(error.message || "Error al cargar reporte")
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, sellerId, agencyId, groupBy])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleExportCSV = () => {
    if (!data?.operations) return

    const headers = ["Fecha", "Destino", "Vendedor", "Venta", "Costo", "Margen", "Moneda", "Estado"]
    const rows = data.operations.map((op: any) => [
      op.operation_date || op.departure_date,
      op.destination,
      op.sellers?.name || "-",
      op.sale_amount_total,
      op.operator_cost,
      op.margin_amount,
      op.currency,
      op.status,
    ])

    const csv = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `reporte-ventas-${dateFrom}-${dateTo}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Reporte exportado")
  }

  const setQuickFilter = (type: string) => {
    const today = new Date()
    if (type === "thisMonth") {
      setDateFrom(format(startOfMonth(today), "yyyy-MM-dd"))
      setDateTo(format(endOfMonth(today), "yyyy-MM-dd"))
    } else if (type === "last30") {
      setDateFrom(format(subDays(today, 30), "yyyy-MM-dd"))
      setDateTo(format(today, "yyyy-MM-dd"))
    } else if (type === "last7") {
      setDateFrom(format(subDays(today, 7), "yyyy-MM-dd"))
      setDateTo(format(today, "yyyy-MM-dd"))
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const totals = data?.totals || {}
  const byPeriod = data?.byPeriod || []
  const bySeller = data?.bySeller || []

  // Preparar datos para el gráfico
  const chartData = byPeriod.map((p: any) => ({
    name: groupBy === "month" 
      ? format(new Date(p.period + "-01"), "MMM yyyy", { locale: es })
      : format(new Date(p.period + "T12:00:00"), "dd/MM", { locale: es }),
    "Ventas USD": Math.round(p.sale_usd),
    "Ventas ARS": Math.round(p.sale_ars / 1000), // En miles para mejor visualización
    "Margen USD": Math.round(p.margin_usd),
  }))

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-6">
            <div>
              <Label>Desde</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {userRole !== "SELLER" && (
              <div>
                <Label>Vendedor</Label>
                <Select value={sellerId} onValueChange={setSellerId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    {sellers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Agencia</Label>
              <Select value={agencyId} onValueChange={setAgencyId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  {agencies.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Agrupar por</Label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Día</SelectItem>
                  <SelectItem value="week">Semana</SelectItem>
                  <SelectItem value="month">Mes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("last7")}>
                7 días
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("last30")}>
                30 días
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter("thisMonth")}>
                Este mes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Operaciones
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.count || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ventas USD
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              US$ {Math.round(totals.sale_total_usd || 0).toLocaleString("es-AR")}
            </div>
            <p className="text-xs text-muted-foreground">
              Margen: US$ {Math.round(totals.margin_total_usd || 0).toLocaleString("es-AR")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ventas ARS
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $ {Math.round(totals.sale_total_ars || 0).toLocaleString("es-AR")}
            </div>
            <p className="text-xs text-muted-foreground">
              Margen: $ {Math.round(totals.margin_total_ars || 0).toLocaleString("es-AR")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Margen Promedio
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totals.sale_total_usd > 0 
                ? Math.round((totals.margin_total_usd / totals.sale_total_usd) * 100)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Sobre ventas USD
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Evolución de Ventas</CardTitle>
            <CardDescription>Ventas y márgenes por período (ARS en miles)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--background))", 
                      border: "1px solid hsl(var(--border))" 
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Ventas USD" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Margen USD" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ventas por Vendedor */}
      {bySeller.length > 0 && userRole !== "SELLER" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Ventas por Vendedor
              </CardTitle>
              <CardDescription>Ranking de vendedores en el período</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Operaciones</TableHead>
                  <TableHead className="text-right">Ventas USD</TableHead>
                  <TableHead className="text-right">Margen USD</TableHead>
                  <TableHead className="text-right">Ventas ARS</TableHead>
                  <TableHead className="text-right">Margen ARS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bySeller.map((s: any, idx: number) => (
                  <TableRow key={s.seller_id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {idx < 3 && (
                          <Badge variant={idx === 0 ? "default" : "secondary"}>
                            #{idx + 1}
                          </Badge>
                        )}
                        {s.seller_name}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                    <TableCell className="text-right font-medium">
                      US$ {Math.round(s.sale_usd).toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      US$ {Math.round(s.margin_usd).toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell className="text-right">
                      $ {Math.round(s.sale_ars).toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      $ {Math.round(s.margin_ars).toLocaleString("es-AR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
