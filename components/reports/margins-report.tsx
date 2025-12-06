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
import { TrendingUp, Download, Loader2, Building2, Package, Users } from "lucide-react"
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
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { useRouter } from "next/navigation"

interface MarginsReportProps {
  userRole: string
  userId: string
  sellers: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
}

export function MarginsReport({ userRole, userId, sellers, agencies }: MarginsReportProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  
  // Filtros
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"))
  const [sellerId, setSellerId] = useState("ALL")
  const [agencyId, setAgencyId] = useState("ALL")
  const [viewType, setViewType] = useState<"seller" | "operator" | "product" | "detail">("seller")

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        sellerId: sellerId !== "ALL" ? sellerId : "",
        agencyId: agencyId !== "ALL" ? agencyId : "",
        viewType,
      })
      
      const res = await fetch(`/api/reports/margins?${params}`)
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
  }, [dateFrom, dateTo, sellerId, agencyId, viewType])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleExportCSV = () => {
    if (!data) return

    let headers: string[] = []
    let rows: any[] = []

    if (viewType === "detail") {
      headers = ["Fecha", "Código", "Destino", "Vendedor", "Venta", "Costo", "Margen", "% Margen", "Moneda"]
      rows = (data.operations || []).map((op: any) => [
        op.operation_date || op.departure_date,
        op.file_code || "-",
        op.destination,
        op.sellers?.name || "-",
        op.sale_amount_total,
        op.operator_cost,
        op.margin_amount,
        `${op.margin_percentage?.toFixed(1) || 0}%`,
        op.currency,
      ])
    } else if (viewType === "seller") {
      headers = ["Vendedor", "Operaciones", "Venta Total", "Costo Total", "Margen Total", "% Margen Promedio"]
      rows = (data.bySeller || []).map((s: any) => [
        s.seller_name,
        s.count,
        s.total_sale,
        s.total_cost,
        s.total_margin,
        `${s.avg_margin_percent?.toFixed(1) || 0}%`,
      ])
    } else if (viewType === "operator") {
      headers = ["Operador", "Operaciones", "Costo Total", "Margen Generado", "% Margen Promedio"]
      rows = (data.byOperator || []).map((o: any) => [
        o.operator_name,
        o.count,
        o.total_cost,
        o.total_margin,
        `${o.avg_margin_percent?.toFixed(1) || 0}%`,
      ])
    } else if (viewType === "product") {
      headers = ["Tipo Producto", "Operaciones", "Venta Total", "Margen Total", "% Margen Promedio"]
      rows = (data.byProduct || []).map((p: any) => [
        p.product_type,
        p.count,
        p.total_sale,
        p.total_margin,
        `${p.avg_margin_percent?.toFixed(1) || 0}%`,
      ])
    }

    const csv = [headers.join(","), ...rows.map((r: any) => r.map((cell: any) => `"${cell}"`).join(","))].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `reporte-margenes-${viewType}-${dateFrom}-${dateTo}.csv`
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

  // Colores para gráficos
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8']

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
              <Label>Vista</Label>
              <Select value={viewType} onValueChange={(v: any) => setViewType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Por Vendedor
                    </div>
                  </SelectItem>
                  <SelectItem value="operator">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Por Operador
                    </div>
                  </SelectItem>
                  <SelectItem value="product">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Por Producto
                    </div>
                  </SelectItem>
                  <SelectItem value="detail">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Detalle Operaciones
                    </div>
                  </SelectItem>
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
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.count || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Venta Total
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totals.currency === "USD" ? "US$" : "$"} {Math.round(totals.total_sale || 0).toLocaleString("es-AR")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totals.currency === "USD" ? "ARS" : "USD"}: {Math.round(totals.total_sale_other || 0).toLocaleString("es-AR")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Margen Total
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totals.currency === "USD" ? "US$" : "$"} {Math.round(totals.total_margin || 0).toLocaleString("es-AR")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {totals.currency === "USD" ? "ARS" : "USD"}: {Math.round(totals.total_margin_other || 0).toLocaleString("es-AR")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              % Margen Promedio
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totals.avg_margin_percent ? totals.avg_margin_percent.toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sobre ventas totales
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla según vista */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>
              {viewType === "seller" && "Márgenes por Vendedor"}
              {viewType === "operator" && "Márgenes por Operador"}
              {viewType === "product" && "Márgenes por Tipo de Producto"}
              {viewType === "detail" && "Detalle de Operaciones"}
            </CardTitle>
            <CardDescription>
              {viewType === "detail" 
                ? "Todas las operaciones con sus márgenes individuales"
                : "Agrupado y resumido"}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {viewType === "detail" && data?.operations && (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Venta</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                    <TableHead className="text-right">% Margen</TableHead>
                    <TableHead>Moneda</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.operations.map((op: any) => (
                    <TableRow key={op.id}>
                      <TableCell className="text-xs">
                        {op.operation_date 
                          ? format(new Date(op.operation_date), "dd/MM/yy", { locale: es })
                          : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{op.file_code || "-"}</TableCell>
                      <TableCell className="text-sm">{op.destination || "-"}</TableCell>
                      <TableCell className="text-sm">{op.sellers?.name || "-"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {op.currency === "USD" ? "US$" : "$"} {Math.round(op.sale_amount_total || 0).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {op.currency === "USD" ? "US$" : "$"} {Math.round(op.operator_cost || 0).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${(op.margin_amount || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {op.currency === "USD" ? "US$" : "$"} {Math.round(op.margin_amount || 0).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={(op.margin_percentage || 0) >= 20 ? "default" : "secondary"} className="text-xs">
                          {(op.margin_percentage || 0).toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{op.currency}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => router.push(`/operations/${op.id}`)}
                        >
                          →
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {viewType === "seller" && data?.bySeller && (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Operaciones</TableHead>
                    <TableHead className="text-right">Venta Total</TableHead>
                    <TableHead className="text-right">Costo Total</TableHead>
                    <TableHead className="text-right">Margen Total</TableHead>
                    <TableHead className="text-right">% Margen Prom.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bySeller.map((s: any, idx: number) => (
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
                        {s.currency === "USD" ? "US$" : "$"} {Math.round(s.total_sale).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {s.currency === "USD" ? "US$" : "$"} {Math.round(s.total_cost).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${s.total_margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {s.currency === "USD" ? "US$" : "$"} {Math.round(s.total_margin).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={s.avg_margin_percent >= 20 ? "default" : "secondary"}>
                          {s.avg_margin_percent.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {viewType === "operator" && data?.byOperator && (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operador</TableHead>
                    <TableHead className="text-right">Operaciones</TableHead>
                    <TableHead className="text-right">Costo Total</TableHead>
                    <TableHead className="text-right">Margen Generado</TableHead>
                    <TableHead className="text-right">% Margen Prom.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byOperator.map((o: any, idx: number) => (
                    <TableRow key={o.operator_id || idx}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {idx < 3 && (
                            <Badge variant={idx === 0 ? "default" : "secondary"}>
                              #{idx + 1}
                            </Badge>
                          )}
                          {o.operator_name || "Sin operador"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{o.count}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {o.currency === "USD" ? "US$" : "$"} {Math.round(o.total_cost).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${o.total_margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {o.currency === "USD" ? "US$" : "$"} {Math.round(o.total_margin).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={o.avg_margin_percent >= 20 ? "default" : "secondary"}>
                          {o.avg_margin_percent.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {viewType === "product" && data?.byProduct && (
            <div className="space-y-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo Producto</TableHead>
                      <TableHead className="text-right">Operaciones</TableHead>
                      <TableHead className="text-right">Venta Total</TableHead>
                      <TableHead className="text-right">Margen Total</TableHead>
                      <TableHead className="text-right">% Margen Prom.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byProduct.map((p: any, idx: number) => (
                      <TableRow key={p.product_type || idx}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {idx < 3 && (
                              <Badge variant={idx === 0 ? "default" : "secondary"}>
                                #{idx + 1}
                              </Badge>
                            )}
                            {p.product_type || "Sin clasificar"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{p.count}</TableCell>
                        <TableCell className="text-right font-medium">
                          {p.currency === "USD" ? "US$" : "$"} {Math.round(p.total_sale).toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${p.total_margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {p.currency === "USD" ? "US$" : "$"} {Math.round(p.total_margin).toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={p.avg_margin_percent >= 20 ? "default" : "secondary"}>
                            {p.avg_margin_percent.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Gráfico de torta */}
              {data.byProduct.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Distribución por Tipo de Producto</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.byProduct.map((p: any) => ({
                              name: p.product_type || "Sin clasificar",
                              value: Math.round(p.total_margin),
                            }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {data.byProduct.map((_: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

