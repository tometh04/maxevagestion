"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  CalendarIcon, RefreshCw, DollarSign, TrendingUp, TrendingDown, 
  Wallet, Building2, Users, Truck, FileText, AlertCircle, CheckCircle2,
  ArrowUpRight, ArrowDownRight
} from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

interface Agency {
  id: string
  name: string
}

interface BalanceData {
  fechaCorte: string
  agencyId: string
  exchangeRate: number
  verificacionContable: boolean
  activo: {
    corriente: {
      cajaYBancos: {
        efectivoUSD: number
        efectivoARS: number
        bancosUSD: number
        bancosARS: number
        totalUSD: number
      }
      cuentasPorCobrar: {
        totalVentas: number
        totalCobrado: number
        saldo: number
        cantidadDeudores: number
        detalle: any[]
      }
      total: number
    }
    noCorriente: {
      bienesDeUso: number
      inversiones: number
      total: number
    }
    total: number
  }
  pasivo: {
    corriente: {
      cuentasPorPagar: {
        totalCostos: number
        totalPagado: number
        saldo: number
        cantidadAcreedores: number
        detalle: any[]
      }
      gastosAPagar: {
        totalUSD: number
        totalARS: number
        saldo: number
        detalle: any[]
      }
      total: number
    }
    noCorriente: {
      deudasLargoPlazo: number
      total: number
    }
    total: number
  }
  patrimonioNeto: {
    capital: number
    resultadosAcumulados: number
    resultadoDelEjercicio: number
    total: number
  }
  resultadoDelMes: {
    ingresos: { usd: number; ars: number; total: number }
    costos: { usd: number; ars: number; total: number }
    gastos: { usd: number; ars: number; total: number }
    resultado: number
    margenBruto: number
  }
}

interface Props {
  agencies: Agency[]
  userRole: string
}

export function MonthlyPositionPageClient({ agencies, userRole }: Props) {
  const { toast } = useToast()
  const currentDate = new Date()
  const [year, setYear] = useState(currentDate.getFullYear())
  const [month, setMonth] = useState(currentDate.getMonth() + 1)
  const [agencyId, setAgencyId] = useState<string>("ALL")
  const [data, setData] = useState<BalanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  // Moneda y conversión
  const [currency, setCurrency] = useState<"USD" | "ARS">("USD")
  const [showCurrencyDialog, setShowCurrencyDialog] = useState(false)
  const [customExchangeRate, setCustomExchangeRate] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString(),
        agencyId,
      })
      const response = await fetch(`/api/accounting/monthly-position?${params.toString()}`)
      if (response.ok) {
        const result = await response.json()
        setData(result)
        setCustomExchangeRate(result.exchangeRate?.toString() || "1000")
      } else {
        toast({
          title: "Error",
          description: "No se pudo cargar la posición contable",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }, [year, month, agencyId, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const selectedDate = new Date(year, month - 1, 1)

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setYear(date.getFullYear())
      setMonth(date.getMonth() + 1)
      setDatePickerOpen(false)
    }
  }

  const handleCurrencyChange = (newCurrency: "USD" | "ARS") => {
    if (newCurrency === "ARS" && currency === "USD") {
      setShowCurrencyDialog(true)
    } else {
      setCurrency(newCurrency)
    }
  }

  const handleConfirmCurrency = () => {
    setCurrency("ARS")
    setShowCurrencyDialog(false)
  }

  // Función para formatear moneda
  const formatMoney = (amount: number): string => {
    const rate = parseFloat(customExchangeRate) || data?.exchangeRate || 1000
    const value = currency === "ARS" ? amount * rate : amount
    
    return new Intl.NumberFormat(currency === "ARS" ? "es-AR" : "en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(value)
  }

  // Formatear solo ARS
  const formatARS = (amount: number): string => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Posición Contable Mensual</h1>
          <p className="text-muted-foreground">
            Balance General al {data?.fechaCorte ? format(new Date(data.fechaCorte + "T12:00:00"), "dd/MM/yyyy") : "..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={data?.verificacionContable ? "default" : "destructive"} className="gap-1">
            {data?.verificacionContable ? (
              <><CheckCircle2 className="h-3 w-3" /> Cuadrado</>
            ) : (
              <><AlertCircle className="h-3 w-3" /> Descuadrado</>
            )}
          </Badge>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            {/* Fecha */}
            <div className="space-y-2">
              <Label>Período</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDate, "MMMM yyyy", { locale: es })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    defaultMonth={selectedDate}
                    locale={es}
                    captionLayout="dropdown"
                    fromYear={2020}
                    toYear={2030}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Agencia */}
            {agencies.length > 0 && (
              <div className="space-y-2">
                <Label>Agencia</Label>
                <Select value={agencyId} onValueChange={setAgencyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas las agencias</SelectItem>
                    {agencies.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Moneda */}
            <div className="space-y-2">
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={(v) => handleCurrencyChange(v as "USD" | "ARS")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">🇺🇸 Dólares (USD)</SelectItem>
                  <SelectItem value="ARS">🇦🇷 Pesos (ARS)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* TC Actual */}
            <div className="space-y-2">
              <Label>TC Referencia</Label>
              <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-muted/50">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{data?.exchangeRate?.toLocaleString() || "-"}</span>
              </div>
            </div>

            {/* Actualizar */}
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button onClick={fetchData} disabled={loading} className="w-full">
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Actualizar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin" />
              Cargando balance...
            </div>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          {/* KPIs */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4 text-green-500" />
                  Total Activo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatMoney(data.activo.total)}</div>
                <p className="text-xs text-muted-foreground mt-1">Lo que la empresa tiene</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <ArrowDownRight className="h-4 w-4 text-red-500" />
                  Total Pasivo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatMoney(data.pasivo.total)}</div>
                <p className="text-xs text-muted-foreground mt-1">Lo que la empresa debe</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-blue-500" />
                  Patrimonio Neto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-bold", data.patrimonioNeto.total >= 0 ? "text-blue-600" : "text-red-600")}>
                  {formatMoney(data.patrimonioNeto.total)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Activo - Pasivo</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                  Resultado del Mes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-bold", data.resultadoDelMes.resultado >= 0 ? "text-green-600" : "text-red-600")}>
                  {formatMoney(data.resultadoDelMes.resultado)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Margen bruto: {data.resultadoDelMes.margenBruto}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs con detalle */}
          <Tabs defaultValue="balance" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
              <TabsTrigger value="balance">Balance General</TabsTrigger>
              <TabsTrigger value="resultados">Estado de Resultados</TabsTrigger>
              <TabsTrigger value="detalle">Detalle</TabsTrigger>
            </TabsList>

            {/* BALANCE GENERAL */}
            <TabsContent value="balance">
              <div className="grid gap-6 lg:grid-cols-2">
            {/* ACTIVO */}
            <Card>
                  <CardHeader className="bg-green-50 dark:bg-green-950/30 rounded-t-lg">
                    <CardTitle className="text-green-700 dark:text-green-400">ACTIVO</CardTitle>
                <CardDescription>Recursos y bienes de la empresa</CardDescription>
              </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    {/* Activo Corriente */}
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Activo Corriente
                      </h4>
                      
                      <div className="space-y-2 pl-4 border-l-2 border-green-200">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-green-600" />
                            <span>Caja y Bancos</span>
                          </div>
                          <span className="font-medium">{formatMoney(data.activo.corriente.cajaYBancos.totalUSD)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground pl-6 space-y-1">
                          <div className="flex justify-between">
                            <span>• Efectivo USD</span>
                            <span>{formatMoney(data.activo.corriente.cajaYBancos.efectivoUSD)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>• Efectivo ARS</span>
                            <span>{formatARS(data.activo.corriente.cajaYBancos.efectivoARS)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>• Bancos USD</span>
                            <span>{formatMoney(data.activo.corriente.cajaYBancos.bancosUSD)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>• Bancos ARS</span>
                            <span>{formatARS(data.activo.corriente.cajaYBancos.bancosARS)}</span>
                    </div>
                  </div>

                        <div className="flex justify-between items-center pt-2">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-yellow-600" />
                            <span>Cuentas por Cobrar</span>
                            <Badge variant="secondary" className="text-xs">
                              {data.activo.corriente.cuentasPorCobrar.cantidadDeudores} deudores
                            </Badge>
                          </div>
                          <span className="font-medium text-yellow-600">
                            {formatMoney(data.activo.corriente.cuentasPorCobrar.saldo)}
                          </span>
                  </div>
                </div>

                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-medium">Subtotal Corriente</span>
                        <span className="font-bold text-green-600">{formatMoney(data.activo.corriente.total)}</span>
                      </div>
                    </div>

                    {/* Activo No Corriente */}
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Activo No Corriente
                      </h4>
                      <div className="space-y-2 pl-4 border-l-2 border-gray-200">
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>Bienes de Uso</span>
                          <span>{formatMoney(0)}</span>
                  </div>
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>Inversiones LP</span>
                          <span>{formatMoney(0)}</span>
                  </div>
                </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-medium">Subtotal No Corriente</span>
                        <span className="font-bold">{formatMoney(data.activo.noCorriente.total)}</span>
                      </div>
                    </div>

                    {/* Total Activo */}
                    <div className="flex justify-between items-center pt-4 border-t-2 border-green-500">
                      <span className="text-lg font-bold">TOTAL ACTIVO</span>
                      <span className="text-lg font-bold text-green-600">{formatMoney(data.activo.total)}</span>
                </div>
              </CardContent>
            </Card>

                {/* PASIVO + PATRIMONIO */}
            <Card>
                  <CardHeader className="bg-red-50 dark:bg-red-950/30 rounded-t-lg">
                    <CardTitle className="text-red-700 dark:text-red-400">PASIVO + PATRIMONIO NETO</CardTitle>
                <CardDescription>Obligaciones y capital</CardDescription>
              </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    {/* Pasivo Corriente */}
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Pasivo Corriente
                      </h4>
                      
                      <div className="space-y-2 pl-4 border-l-2 border-red-200">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-orange-600" />
                            <span>Cuentas por Pagar</span>
                            <Badge variant="secondary" className="text-xs">
                              {data.pasivo.corriente.cuentasPorPagar.cantidadAcreedores} acreedores
                            </Badge>
                          </div>
                          <span className="font-medium text-orange-600">
                            {formatMoney(data.pasivo.corriente.cuentasPorPagar.saldo)}
                        </span>
                    </div>

                        <div className="flex justify-between items-center pt-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-red-600" />
                            <span>Gastos a Pagar</span>
                  </div>
                          <span className="font-medium">{formatMoney(data.pasivo.corriente.gastosAPagar.saldo)}</span>
                  </div>
                </div>

                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-medium">Subtotal Corriente</span>
                        <span className="font-bold text-red-600">{formatMoney(data.pasivo.corriente.total)}</span>
                      </div>
                    </div>

                    {/* Pasivo No Corriente */}
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Pasivo No Corriente
                      </h4>
                      <div className="space-y-2 pl-4 border-l-2 border-gray-200">
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>Deudas a Largo Plazo</span>
                          <span>{formatMoney(0)}</span>
                    </div>
                  </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-medium">Subtotal No Corriente</span>
                        <span className="font-bold">{formatMoney(data.pasivo.noCorriente.total)}</span>
                  </div>
                </div>

                    {/* Total Pasivo */}
                    <div className="flex justify-between items-center pt-4 border-t-2 border-red-500">
                      <span className="text-lg font-bold">TOTAL PASIVO</span>
                      <span className="text-lg font-bold text-red-600">{formatMoney(data.pasivo.total)}</span>
                    </div>

                    {/* Patrimonio Neto */}
                    <div className="space-y-3 pt-4">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Patrimonio Neto
                      </h4>
                      <div className="space-y-2 pl-4 border-l-2 border-blue-200">
                        <div className="flex justify-between items-center">
                          <span>Resultado del Ejercicio</span>
                          <span className={cn("font-medium", data.patrimonioNeto.resultadoDelEjercicio >= 0 ? "text-green-600" : "text-red-600")}>
                            {formatMoney(data.patrimonioNeto.resultadoDelEjercicio)}
                          </span>
                  </div>
                </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-medium">Total Patrimonio Neto</span>
                        <span className="font-bold text-blue-600">{formatMoney(data.patrimonioNeto.total)}</span>
                  </div>
                </div>

                    {/* Total Pasivo + PN */}
                    <div className="flex justify-between items-center pt-4 border-t-2 border-blue-500">
                      <span className="text-lg font-bold">TOTAL PASIVO + PN</span>
                      <span className="text-lg font-bold">{formatMoney(data.pasivo.total + data.patrimonioNeto.total)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
            </TabsContent>

            {/* ESTADO DE RESULTADOS */}
            <TabsContent value="resultados">
          <Card>
            <CardHeader>
                  <CardTitle>Estado de Resultados - {format(selectedDate, "MMMM yyyy", { locale: es })}</CardTitle>
                  <CardDescription>Ingresos, costos y gastos del período</CardDescription>
            </CardHeader>
                <CardContent>
                  <div className="space-y-6 max-w-2xl">
                    {/* Ingresos */}
                    <div className="flex justify-between items-center py-3 border-b">
              <div>
                        <span className="font-medium text-lg">Ingresos (Cobros de Clientes)</span>
                        <p className="text-xs text-muted-foreground">
                          USD: {formatMoney(data.resultadoDelMes.ingresos.usd)} | ARS: {formatARS(data.resultadoDelMes.ingresos.ars)}
                        </p>
                      </div>
                      <span className="text-xl font-bold text-green-600">
                        {formatMoney(data.resultadoDelMes.ingresos.total)}
                      </span>
                    </div>

                    {/* Costos */}
                    <div className="flex justify-between items-center py-3 border-b">
                      <div>
                        <span className="font-medium text-lg">(-) Costos (Pagos a Operadores)</span>
                        <p className="text-xs text-muted-foreground">
                          USD: {formatMoney(data.resultadoDelMes.costos.usd)} | ARS: {formatARS(data.resultadoDelMes.costos.ars)}
                        </p>
                  </div>
                      <span className="text-xl font-bold text-orange-600">
                        ({formatMoney(data.resultadoDelMes.costos.total)})
                      </span>
                </div>

                    {/* Margen Bruto */}
                    <div className="flex justify-between items-center py-3 bg-muted/50 px-4 rounded-lg">
                      <span className="font-semibold">= Margen Bruto</span>
                      <div className="text-right">
                        <span className="text-xl font-bold">
                          {formatMoney(data.resultadoDelMes.ingresos.total - data.resultadoDelMes.costos.total)}
                        </span>
                        <p className="text-xs text-muted-foreground">{data.resultadoDelMes.margenBruto}%</p>
                </div>
              </div>

                    {/* Gastos */}
                    <div className="flex justify-between items-center py-3 border-b">
              <div>
                        <span className="font-medium text-lg">(-) Gastos Operativos</span>
                        <p className="text-xs text-muted-foreground">
                          USD: {formatMoney(data.resultadoDelMes.gastos.usd)} | ARS: {formatARS(data.resultadoDelMes.gastos.ars)}
                        </p>
                      </div>
                      <span className="text-xl font-bold text-red-600">
                        ({formatMoney(data.resultadoDelMes.gastos.total)})
                      </span>
                    </div>

                    {/* Resultado */}
                    <div className={cn(
                      "flex justify-between items-center py-4 px-4 rounded-lg",
                      data.resultadoDelMes.resultado >= 0 ? "bg-green-100 dark:bg-green-950" : "bg-red-100 dark:bg-red-950"
                    )}>
                      <span className="font-bold text-lg">= RESULTADO DEL MES</span>
                      <span className={cn(
                        "text-2xl font-bold",
                        data.resultadoDelMes.resultado >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {formatMoney(data.resultadoDelMes.resultado)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* DETALLE */}
            <TabsContent value="detalle">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Cuentas por Cobrar */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-yellow-600" />
                      Cuentas por Cobrar
                    </CardTitle>
                    <CardDescription>
                      Total: {formatMoney(data.activo.corriente.cuentasPorCobrar.saldo)} ({data.activo.corriente.cuentasPorCobrar.cantidadDeudores} clientes)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.activo.corriente.cuentasPorCobrar.detalle.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Operación</TableHead>
                            <TableHead>Destino</TableHead>
                            <TableHead className="text-right">Deuda</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.activo.corriente.cuentasPorCobrar.detalle.map((d, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{d.operacion}</TableCell>
                              <TableCell>{d.destino}</TableCell>
                              <TableCell className="text-right text-yellow-600 font-medium">
                                {formatMoney(d.deuda)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">No hay deudas pendientes</p>
                    )}
                  </CardContent>
                </Card>

                {/* Cuentas por Pagar */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-orange-600" />
                      Cuentas por Pagar
                    </CardTitle>
                    <CardDescription>
                      Total: {formatMoney(data.pasivo.corriente.cuentasPorPagar.saldo)} ({data.pasivo.corriente.cuentasPorPagar.cantidadAcreedores} operadores)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.pasivo.corriente.cuentasPorPagar.detalle.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Operación</TableHead>
                            <TableHead>Destino</TableHead>
                            <TableHead className="text-right">Deuda</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.pasivo.corriente.cuentasPorPagar.detalle.map((d, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{d.operacion}</TableCell>
                              <TableCell>{d.destino}</TableCell>
                              <TableCell className="text-right text-orange-600 font-medium">
                                {formatMoney(d.deuda)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">No hay deudas con operadores</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">No hay datos disponibles</div>
          </CardContent>
        </Card>
      )}

      {/* Dialog para cambio de moneda */}
      <Dialog open={showCurrencyDialog} onOpenChange={setShowCurrencyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar a Pesos Argentinos</DialogTitle>
            <DialogDescription>
              Ingrese el tipo de cambio USD/ARS para convertir todos los valores.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Tipo de Cambio (1 USD = X ARS)</Label>
            <Input
              type="number"
              value={customExchangeRate}
              onChange={(e) => setCustomExchangeRate(e.target.value)}
              placeholder="Ej: 1000"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              TC de referencia del sistema: {data?.exchangeRate?.toLocaleString()}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCurrencyDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmCurrency}>
              Convertir a ARS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
