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
import { ArrowUpCircle, ArrowDownCircle, Wallet, Download, Loader2, TrendingUp, TrendingDown } from "lucide-react"
import { toast } from "sonner"
import { format, subDays, startOfMonth, endOfMonth } from "date-fns"
import { es } from "date-fns/locale"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

const categoryLabels: Record<string, string> = {
  PAGO_CLIENTE: "Pago de Cliente",
  PAGO_OPERADOR: "Pago a Operador",
  RETIRO_SOCIO: "Retiro de Socio",
  COMISION: "Comisión",
  GASTO_OPERATIVO: "Gasto Operativo",
  AJUSTE: "Ajuste",
  TRANSFERENCIA: "Transferencia",
  OTRO: "Otro",
}

interface CashFlowReportProps {
  agencies: Array<{ id: string; name: string }>
}

export function CashFlowReport({ agencies }: CashFlowReportProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  
  // Filtros
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"))
  const [currency, setCurrency] = useState("ALL")
  const [agencyId, setAgencyId] = useState("ALL")

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        currency,
        agencyId,
      })
      
      const res = await fetch(`/api/reports/cash-flow?${params}`)
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
  }, [dateFrom, dateTo, currency, agencyId])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

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
  const byCategory = data?.byCategory || []
  const byDay = data?.byDay || []
  const accountBalances = data?.accountBalances || { summary: { total_ars: 0, total_usd: 0, by_agency: {} }, accounts: [] }

  // Preparar datos para el gráfico
  const chartData = byDay.map((d: any) => ({
    name: format(new Date(d.date + "T12:00:00"), "dd/MM", { locale: es }),
    "Ingresos USD": Math.round(d.income_usd),
    "Egresos USD": Math.round(d.expense_usd),
    "Balance USD": Math.round(d.balance_usd),
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
            <div>
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  <SelectItem value="ARS">ARS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Agencia</Label>
              <Select value={agencyId} onValueChange={setAgencyId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  {agencies.map((agency) => (
                    <SelectItem key={agency.id} value={agency.id}>
                      {agency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 col-span-2">
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

      {/* Saldos Actuales de Cuentas */}
      {accountBalances.accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Saldos Actuales de Cuentas Financieras
            </CardTitle>
            <CardDescription>
              Balance actual de todas las cuentas activas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Total ARS</div>
                <div className="text-2xl font-bold text-amber-600">
                  $ {Math.round(accountBalances.summary.total_ars || 0).toLocaleString("es-AR")}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Total USD</div>
                <div className="text-2xl font-bold text-amber-600">
                  US$ {Math.round(accountBalances.summary.total_usd || 0).toLocaleString("es-AR")}
                </div>
              </div>
            </div>
            
            {Object.entries(accountBalances.summary.by_agency || {}).length > 0 && (
              <div className="space-y-4">
                {Object.entries(accountBalances.summary.by_agency).map(([agencyId, agencyData]: [string, any]) => (
                  <div key={agencyId} className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-3">{agencyData.agency_name || "Sin agencia"}</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cuenta</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agencyData.accounts.map((account: any) => (
                          <TableRow key={account.id}>
                            <TableCell className="font-medium">{account.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {account.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`font-semibold ${(account.current_balance || 0) >= 0 ? "text-amber-600" : "text-red-600"}`}>
                                {account.currency === "USD" ? "US$" : "$"} {Math.round(account.current_balance || 0).toLocaleString("es-AR")}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50">
                          <TableCell colSpan={2} className="font-semibold">
                            Subtotal {agencyData.agency_name}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="space-y-1">
                              <div className="font-semibold text-amber-600">
                                $ {Math.round(agencyData.ars || 0).toLocaleString("es-AR")}
                              </div>
                              <div className="font-semibold text-amber-600">
                                US$ {Math.round(agencyData.usd || 0).toLocaleString("es-AR")}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ingresos
            </CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="text-xl font-bold text-green-600">
                US$ {Math.round(totals.income_usd || 0).toLocaleString("es-AR")}
              </div>
              <div className="text-lg font-semibold text-green-600">
                $ {Math.round(totals.income_ars || 0).toLocaleString("es-AR")}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Egresos
            </CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="text-xl font-bold text-red-600">
                US$ {Math.round(totals.expense_usd || 0).toLocaleString("es-AR")}
              </div>
              <div className="text-lg font-semibold text-red-600">
                $ {Math.round(totals.expense_ars || 0).toLocaleString("es-AR")}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Balance Neto
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className={`text-xl font-bold ${(totals.net_usd || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                US$ {Math.round(totals.net_usd || 0).toLocaleString("es-AR")}
              </div>
              <div className={`text-lg font-semibold ${(totals.net_ars || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                $ {Math.round(totals.net_ars || 0).toLocaleString("es-AR")}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Balance Acumulado */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Flujo de Caja (USD)</CardTitle>
            <CardDescription>Ingresos, egresos y balance acumulado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
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
                  <Area 
                    type="monotone" 
                    dataKey="Balance USD" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Desglose por Categoría */}
      {byCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Desglose por Categoría</CardTitle>
            <CardDescription>Ingresos y egresos por tipo de movimiento</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Ingresos USD</TableHead>
                  <TableHead className="text-right">Egresos USD</TableHead>
                  <TableHead className="text-right">Ingresos ARS</TableHead>
                  <TableHead className="text-right">Egresos ARS</TableHead>
                  <TableHead className="text-right">Neto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCategory.map((c: any) => {
                  const netUsd = c.income_usd - c.expense_usd
                  const netArs = c.income_ars - c.expense_ars
                  return (
                    <TableRow key={c.category}>
                      <TableCell className="font-medium">
                        {categoryLabels[c.category] || c.category}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {c.income_usd > 0 ? `US$ ${Math.round(c.income_usd).toLocaleString("es-AR")}` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {c.expense_usd > 0 ? `US$ ${Math.round(c.expense_usd).toLocaleString("es-AR")}` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {c.income_ars > 0 ? `$ ${Math.round(c.income_ars).toLocaleString("es-AR")}` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {c.expense_ars > 0 ? `$ ${Math.round(c.expense_ars).toLocaleString("es-AR")}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`font-medium ${netUsd >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {netUsd !== 0 && `US$ ${Math.round(netUsd).toLocaleString("es-AR")}`}
                        </div>
                        <div className={`text-sm ${netArs >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {netArs !== 0 && `$ ${Math.round(netArs).toLocaleString("es-AR")}`}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

