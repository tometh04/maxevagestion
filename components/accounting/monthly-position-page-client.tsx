"use client"

import { useState, useEffect, useCallback } from "react"
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
  CalendarIcon, RefreshCw, DollarSign, TrendingUp, 
  Wallet, Users, Truck, FileText, AlertCircle, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Save, Share2, HelpCircle
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { DistributeProfitsDialog } from "./distribute-profits-dialog"

interface Agency {
  id: string
  name: string
}

interface BalanceData {
  fechaCorte: string
  agencyId: string
  monthlyTC: number | null
  latestTC: number
  tcUsado: number
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
        totalUSD: number
        cantidadDeudores: number
        detalle: any[]
      }
      total: number
    }
    noCorriente: { total: number }
    total: number
  }
  pasivo: {
    corriente: {
      cuentasPorPagar: {
        totalUSD: number
        cantidadAcreedores: number
        detalle: any[]
      }
      gastosAPagar: {
        totalUSD: number
        totalARS: number
        saldoUSD: number
        detalle: any[]
      }
      total: number
    }
    noCorriente: { total: number }
    total: number
  }
  patrimonioNeto: {
    resultadoEjercicio: number
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
  
  // TC mensual editable
  const [tcInput, setTcInput] = useState("")
  const [savingTC, setSavingTC] = useState(false)
  
  // Moneda display
  const [currency, setCurrency] = useState<"USD" | "ARS">("USD")
  const [showCurrencyDialog, setShowCurrencyDialog] = useState(false)
  const [displayTC, setDisplayTC] = useState("")
  
  // Dialog de distribuir ganancias
  const [showDistributeDialog, setShowDistributeDialog] = useState(false)

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
        // Setear el TC del mes si existe, sino el más reciente
        setTcInput(result.monthlyTC?.toString() || result.latestTC?.toString() || "1000")
        setDisplayTC(result.tcUsado?.toString() || "1000")
      } else {
        const errorData = await response.json()
        toast({
          title: "Error",
          description: errorData.error || "No se pudo cargar la posición contable",
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

  const handleSaveTC = async () => {
    const tcValue = parseFloat(tcInput)
    if (isNaN(tcValue) || tcValue <= 0) {
      toast({
        title: "Error",
        description: "El tipo de cambio debe ser un número mayor a 0",
        variant: "destructive",
      })
      return
    }

    setSavingTC(true)
    try {
      const response = await fetch("/api/accounting/monthly-exchange-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          usd_to_ars_rate: tcValue,
        }),
      })

      if (response.ok) {
        toast({
          title: "Tipo de cambio guardado",
          description: `TC para ${format(new Date(year, month - 1), "MMMM yyyy", { locale: es })}: ${tcValue}`,
        })
        // Refrescar datos con el nuevo TC
        fetchData()
      } else {
        const errorData = await response.json()
        toast({
          title: "Error",
          description: errorData.error || "No se pudo guardar",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al guardar el tipo de cambio",
        variant: "destructive",
      })
    } finally {
      setSavingTC(false)
    }
  }

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
      setDisplayTC(tcInput || data?.tcUsado?.toString() || "1000")
      setShowCurrencyDialog(true)
    } else {
      setCurrency(newCurrency)
    }
  }

  const handleConfirmCurrency = () => {
    setCurrency("ARS")
    setShowCurrencyDialog(false)
  }

  // Formatear moneda (con manejo de NaN)
  const formatMoney = (amount: number | null | undefined): string => {
    const safeAmount = typeof amount === "number" && !isNaN(amount) ? amount : 0
    const rate = parseFloat(displayTC) || data?.tcUsado || 1000
    const value = currency === "ARS" ? safeAmount * rate : safeAmount
    
    return new Intl.NumberFormat(currency === "ARS" ? "es-AR" : "en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatARS = (amount: number | null | undefined): string => {
    const safeAmount = typeof amount === "number" && !isNaN(amount) ? amount : 0
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
    }).format(safeAmount)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Posición Contable Mensual</h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-1">¿Cómo funciona?</p>
                  <p className="text-xs mb-2"><strong>Balance General:</strong> Estado de Activos (lo que tienes), Pasivos (lo que debes) y Patrimonio Neto al cierre del mes.</p>
                  <p className="text-xs mb-2"><strong>Estado de Resultados:</strong> Ingresos, costos, gastos y resultado del mes (ganancia/pérdida).</p>
                  <p className="text-xs">Usa un tipo de cambio mensual independiente para dolarizar todos los valores. Verifica que Activo = Pasivo + Patrimonio Neto.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-muted-foreground">
            Balance General al {data?.fechaCorte ? format(new Date(data.fechaCorte + "T12:00:00"), "dd/MM/yyyy") : "..."}
          </p>
        </div>
        <Badge variant={data?.verificacionContable ? "default" : "destructive"} className="gap-1 w-fit">
          {data?.verificacionContable ? (
            <><CheckCircle2 className="h-3 w-3" /> Cuadrado</>
          ) : (
            <><AlertCircle className="h-3 w-3" /> Descuadrado</>
          )}
        </Badge>
      </div>

      {/* Filtros */}
      <div className="flex items-end gap-3 flex-wrap">
            {/* Período */}
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 text-xs w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
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
              <div className="space-y-1">
                <Label className="text-xs">Agencia</Label>
                <Select value={agencyId} onValueChange={setAgencyId}>
                  <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas</SelectItem>
                    {agencies.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* TC del Mes (Editable) */}
            <div className="space-y-1">
              <Label className="text-xs">TC del Mes (USD/ARS)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={tcInput}
                  onChange={(e) => setTcInput(e.target.value)}
                  placeholder="1000"
                  className="flex-1 h-8 text-xs"
                />
                <Button 
                  size="icon" 
                  onClick={handleSaveTC} 
                  disabled={savingTC}
                  title="Guardar TC para este mes"
                >
                  <Save className={cn("h-4 w-4", savingTC && "animate-spin")} />
                </Button>
              </div>
              {data?.monthlyTC && (
                <p className="text-xs text-success">✓ TC guardado para este mes</p>
              )}
            </div>

            {/* Moneda Display */}
            <div className="space-y-1">
              <Label className="text-xs">Ver en</Label>
              <Select value={currency} onValueChange={(v) => handleCurrencyChange(v as "USD" | "ARS")}>
                <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">🇺🇸 USD</SelectItem>
                  <SelectItem value="ARS">🇦🇷 ARS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Actualizar */}
            <div>
              <Button size="sm" className="h-8 rounded-full" onClick={fetchData} disabled={loading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Actualizar
              </Button>
            </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border/40 py-12">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin" />
              Cargando balance...
            </div>
        </div>
      ) : data ? (
        <>
          {/* KPIs */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/40 p-5 border-l-4 border-l-success">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-success" />
                Total Activo
              </p>
              <div className="text-2xl font-semibold tabular-nums tracking-tight text-success mt-1">{formatMoney(data.activo.total)}</div>
              <p className="text-xs text-muted-foreground mt-1">Lo que tenemos</p>
            </div>

            <div className="rounded-xl border border-border/40 p-5 border-l-4 border-l-destructive">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <ArrowDownRight className="h-4 w-4 text-destructive" />
                Total Pasivo
              </p>
              <div className="text-2xl font-semibold tabular-nums tracking-tight text-destructive mt-1">{formatMoney(data.pasivo.total)}</div>
              <p className="text-xs text-muted-foreground mt-1">Lo que debemos</p>
            </div>

            <div className="rounded-xl border border-border/40 p-5 border-l-4 border-l-info">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4 text-info" />
                Patrimonio Neto
              </p>
              <div className={cn("text-2xl font-semibold tabular-nums tracking-tight mt-1", data.patrimonioNeto.total >= 0 ? "text-info" : "text-destructive")}>
                {formatMoney(data.patrimonioNeto.total)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Activo - Pasivo</p>
            </div>

            <div className="rounded-xl border border-border/40 p-5 border-l-4 border-l-purple-500">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                Resultado del Mes
              </p>
              <div className={cn("text-2xl font-semibold tabular-nums tracking-tight mt-1", data.resultadoDelMes.resultado >= 0 ? "text-success" : "text-destructive")}>
                {formatMoney(data.resultadoDelMes.resultado)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Margen: {data.resultadoDelMes.margenBruto}%
              </p>
              {data.resultadoDelMes.resultado > 0 && ["SUPER_ADMIN", "ADMIN", "CONTABLE"].includes(userRole) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full mt-3 w-full"
                  onClick={() => setShowDistributeDialog(true)}
                >
                  <Share2 className="h-3 w-3 mr-2" />
                  Distribuir a Socios
                </Button>
              )}
            </div>
          </div>

          {/* Tabs */}
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
                <div className="rounded-xl border border-border/40 overflow-hidden">
                  <div className="px-5 py-4 border-b border-border/40 bg-muted/20">
                    <h3 className="text-sm font-semibold text-success uppercase tracking-wider">ACTIVO</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Lo que la empresa tiene</p>
                  </div>
                  <div className="px-5 py-5 space-y-6">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Activo Corriente
                      </h4>
                      
                      <div className="space-y-2 pl-4 border-l-2 border-success/30">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-success" />
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
                            {formatMoney(data.activo.corriente.cuentasPorCobrar.totalUSD)}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-medium">Subtotal Corriente</span>
                        <span className="font-bold text-success">{formatMoney(data.activo.corriente.total)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t-2 border-success">
                      <span className="text-lg font-bold">TOTAL ACTIVO</span>
                      <span className="text-lg font-bold text-success">{formatMoney(data.activo.total)}</span>
                    </div>
                  </div>
                </div>

                {/* PASIVO + PN */}
                <div className="rounded-xl border border-border/40 overflow-hidden">
                  <div className="px-5 py-4 border-b border-border/40 bg-muted/20">
                    <h3 className="text-sm font-semibold text-destructive uppercase tracking-wider">PASIVO + PATRIMONIO NETO</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Lo que la empresa debe y el capital</p>
                  </div>
                  <div className="px-5 py-5 space-y-6">
                    <div className="space-y-3">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Pasivo Corriente
                      </h4>
                      
                      <div className="space-y-2 pl-4 border-l-2 border-destructive/30">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-warning" />
                            <span>Cuentas por Pagar</span>
                            <Badge variant="secondary" className="text-xs">
                              {data.pasivo.corriente.cuentasPorPagar.cantidadAcreedores} acreedores
                            </Badge>
                          </div>
                          <span className="font-medium text-warning">
                            {formatMoney(data.pasivo.corriente.cuentasPorPagar.totalUSD)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-destructive" />
                            <span>Gastos a Pagar</span>
                          </div>
                          <span className="font-medium">{formatMoney(data.pasivo.corriente.gastosAPagar.saldoUSD)}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-medium">Subtotal Corriente</span>
                        <span className="font-bold text-destructive">{formatMoney(data.pasivo.corriente.total)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t-2 border-destructive">
                      <span className="text-lg font-bold">TOTAL PASIVO</span>
                      <span className="text-lg font-bold text-destructive">{formatMoney(data.pasivo.total)}</span>
                    </div>

                    <div className="space-y-3 pt-4">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        Patrimonio Neto
                      </h4>
                      <div className="space-y-2 pl-4 border-l-2 border-info/30">
                        <div className="flex justify-between items-center">
                          <span>Resultado del Ejercicio</span>
                          <span className={cn("font-medium", data.patrimonioNeto.resultadoEjercicio >= 0 ? "text-success" : "text-destructive")}>
                            {formatMoney(data.patrimonioNeto.resultadoEjercicio)}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-medium">Total Patrimonio Neto</span>
                        <span className="font-bold text-info">{formatMoney(data.patrimonioNeto.total)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t-2 border-info">
                      <span className="text-lg font-bold">TOTAL PASIVO + PN</span>
                      <span className="text-lg font-bold">{formatMoney(data.pasivo.total + data.patrimonioNeto.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ESTADO DE RESULTADOS */}
            <TabsContent value="resultados">
              <div className="rounded-xl border border-border/40 overflow-hidden">
                <div className="px-5 py-4 border-b border-border/40 bg-muted/20">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Estado de Resultados - {format(selectedDate, "MMMM yyyy", { locale: es })}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Ingresos, costos y gastos del período</p>
                </div>
                <div className="px-5 py-5">
                  <div className="space-y-6 max-w-2xl">
                    <div className="flex justify-between items-center py-3 border-b">
                      <div>
                        <span className="font-medium text-lg">Ingresos (Cobros)</span>
                        <p className="text-xs text-muted-foreground">
                          USD {formatMoney(data.resultadoDelMes.ingresos.usd)} | ARS {formatARS(data.resultadoDelMes.ingresos.ars)}
                        </p>
                      </div>
                      <span className="text-xl font-bold text-success">
                        {formatMoney(data.resultadoDelMes.ingresos.total)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-3 border-b">
                      <div>
                        <span className="font-medium text-lg">(-) Costos (Pagos a Operadores)</span>
                        <p className="text-xs text-muted-foreground">
                          USD {formatMoney(data.resultadoDelMes.costos.usd)} | ARS {formatARS(data.resultadoDelMes.costos.ars)}
                        </p>
                      </div>
                      <span className="text-xl font-bold text-warning">
                        ({formatMoney(data.resultadoDelMes.costos.total)})
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-3 bg-muted/50 px-4 rounded-lg">
                      <span className="font-semibold">= Margen Bruto</span>
                      <div className="text-right">
                        <span className="text-xl font-bold">
                          {formatMoney(data.resultadoDelMes.ingresos.total - data.resultadoDelMes.costos.total)}
                        </span>
                        <p className="text-xs text-muted-foreground">{data.resultadoDelMes.margenBruto}%</p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center py-3 border-b">
                      <div>
                        <span className="font-medium text-lg">(-) Gastos Operativos</span>
                        <p className="text-xs text-muted-foreground">
                          USD {formatMoney(data.resultadoDelMes.gastos.usd)} | ARS {formatARS(data.resultadoDelMes.gastos.ars)}
                        </p>
                      </div>
                      <span className="text-xl font-bold text-destructive">
                        ({formatMoney(data.resultadoDelMes.gastos.total)})
                      </span>
                    </div>

                    <div className={cn(
                      "flex justify-between items-center py-4 px-4 rounded-lg",
                      data.resultadoDelMes.resultado >= 0 ? "bg-success/10" : "bg-destructive/10"
                    )}>
                      <span className="font-bold text-lg">= RESULTADO DEL MES</span>
                      <span className={cn(
                        "text-2xl font-bold",
                        data.resultadoDelMes.resultado >= 0 ? "text-success" : "text-destructive"
                      )}>
                        {formatMoney(data.resultadoDelMes.resultado)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* DETALLE */}
            <TabsContent value="detalle">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Cuentas por Cobrar */}
                <div className="rounded-xl border border-border/40 overflow-hidden">
                  <div className="px-5 py-4 border-b border-border/40 bg-muted/20">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Users className="h-4 w-4 text-yellow-600" />
                      Cuentas por Cobrar (Deudores)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {data.activo.corriente.cuentasPorCobrar.cantidadDeudores} clientes deben {formatMoney(data.activo.corriente.cuentasPorCobrar.totalUSD)}
                    </p>
                  </div>
                  <div className="px-5 py-5">
                    {data.activo.corriente.cuentasPorCobrar.detalle.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Operación</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead className="text-right">Deuda</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.activo.corriente.cuentasPorCobrar.detalle.map((d, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{d.operacion}</TableCell>
                              <TableCell>{d.cliente}</TableCell>
                              <TableCell className="text-right text-yellow-600 font-medium">
                                {formatMoney(d.deuda)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">No hay deudores</p>
                    )}
                  </div>
                </div>

                {/* Cuentas por Pagar */}
                <div className="rounded-xl border border-border/40 overflow-hidden">
                  <div className="px-5 py-4 border-b border-border/40 bg-muted/20">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Truck className="h-4 w-4 text-warning" />
                      Cuentas por Pagar (Acreedores)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {data.pasivo.corriente.cuentasPorPagar.cantidadAcreedores} pagos pendientes: {formatMoney(data.pasivo.corriente.cuentasPorPagar.totalUSD)}
                    </p>
                  </div>
                  <div className="px-5 py-5">
                    {data.pasivo.corriente.cuentasPorPagar.detalle.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Operación</TableHead>
                            <TableHead>Operador</TableHead>
                            <TableHead className="text-right">Deuda</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.pasivo.corriente.cuentasPorPagar.detalle.map((d, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{d.operacion}</TableCell>
                              <TableCell>{d.operador}</TableCell>
                              <TableCell className="text-right text-warning font-medium">
                                {formatMoney(d.montoUSD)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">No hay deudas con operadores</p>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <div className="rounded-xl border border-border/40 py-8">
            <div className="text-center text-muted-foreground">No hay datos disponibles</div>
        </div>
      )}

      {/* Dialog para cambio de moneda */}
      <Dialog open={showCurrencyDialog} onOpenChange={setShowCurrencyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar a Pesos Argentinos</DialogTitle>
            <DialogDescription>
              Ingrese el tipo de cambio para convertir todos los valores.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Tipo de Cambio (1 USD = X ARS)</Label>
            <Input
              type="number"
              value={displayTC}
              onChange={(e) => setDisplayTC(e.target.value)}
              placeholder="Ej: 1000"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              TC del mes: {data?.monthlyTC || "No definido"} | TC sistema: {data?.latestTC}
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

      {/* Dialog de distribuir ganancias */}
      {data && data.resultadoDelMes.resultado > 0 && (
        <DistributeProfitsDialog
          open={showDistributeDialog}
          onOpenChange={setShowDistributeDialog}
          year={year}
          month={month}
          profitAmount={data.resultadoDelMes.resultado}
          exchangeRate={data.tcUsado}
          onSuccess={() => {
            // Opcional: refrescar datos después de distribuir
            // fetchData()
          }}
        />
      )}
    </div>
  )
}
