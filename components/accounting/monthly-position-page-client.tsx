"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Save, RefreshCw, TrendingUp, TrendingDown, Wallet, Building2, Users, Truck } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

interface Agency {
  id: string
  name: string
}

interface MonthlyPosition {
  year: number
  month: number
  agencyId: string
  monthlyExchangeRate: number | null
  latestExchangeRate: number
  detalle: {
    efectivo: { usd: number; ars: number }
    bancos: { usd: number; ars: number }
    cuentasPorCobrar: number
    cuentasPorPagar: number
    gastosRecurrentesPendientes: { usd: number; ars: number }
  }
  activo: {
    corriente: number
    no_corriente: number
    total: number
  }
  pasivo: {
    corriente: number
    no_corriente: number
    total: number
  }
  patrimonio_neto: number
  resultado: {
    ingresos: { usd: number; ars: number; total: number }
    costos: { usd: number; ars: number; total: number }
    gastos: { usd: number; ars: number; total: number }
    resultado: number
  }
}

interface MonthlyPositionPageClientProps {
  agencies: Agency[]
  userRole: string
}

function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatARS(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

export function MonthlyPositionPageClient({ agencies, userRole }: MonthlyPositionPageClientProps) {
  const { toast } = useToast()
  const currentDate = new Date()
  const [year, setYear] = useState(currentDate.getFullYear())
  const [month, setMonth] = useState(currentDate.getMonth() + 1)
  const [agencyId, setAgencyId] = useState<string>("ALL")
  const [position, setPosition] = useState<MonthlyPosition | null>(null)
  const [loading, setLoading] = useState(true)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [exchangeRate, setExchangeRate] = useState<string>("")
  const [savingExchangeRate, setSavingExchangeRate] = useState(false)

  const fetchPosition = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString(),
        agencyId,
      })
      const response = await fetch(`/api/accounting/monthly-position?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setPosition(data)
        if (data.monthlyExchangeRate) {
          setExchangeRate(data.monthlyExchangeRate.toString())
        } else {
          setExchangeRate("")
        }
      } else {
        console.error("Error fetching position:", await response.text())
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
    fetchPosition()
  }, [fetchPosition])

  const selectedDate = new Date(year, month - 1, 1)

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setYear(date.getFullYear())
      setMonth(date.getMonth() + 1)
      setDatePickerOpen(false)
    }
  }

  const handleSaveExchangeRate = async () => {
    const rate = parseFloat(exchangeRate)
    if (isNaN(rate) || rate <= 0) {
      toast({
        title: "Error",
        description: "El tipo de cambio debe ser un número mayor a 0",
        variant: "destructive",
      })
      return
    }

    setSavingExchangeRate(true)
    try {
      const response = await fetch("/api/accounting/monthly-exchange-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, usd_to_ars_rate: rate }),
      })

      if (response.ok) {
        toast({
          title: "Éxito",
          description: "Tipo de cambio guardado correctamente",
        })
        fetchPosition()
      } else {
        const errorData = await response.json()
        toast({
          title: "Error",
          description: errorData.error || "No se pudo guardar el tipo de cambio",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error saving exchange rate:", error)
      toast({
        title: "Error",
        description: "Error al guardar tipo de cambio",
        variant: "destructive",
      })
    } finally {
      setSavingExchangeRate(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Posición Contable Mensual</h1>
        <p className="text-muted-foreground">Estado de situación patrimonial al cierre del mes (en USD)</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {/* Mes y Año */}
            <div className="space-y-2">
              <Label>Mes y Año</Label>
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
                    <SelectValue placeholder="Todas las agencias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas las agencias</SelectItem>
                    {agencies.map((agency) => (
                      <SelectItem key={agency.id} value={agency.id}>
                        {agency.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Tipo de Cambio */}
            <div className="space-y-2">
              <Label>TC Mensual (USD/ARS)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder={`Ej: ${position?.latestExchangeRate || 1000}`}
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  step="0.01"
                  min="0"
                />
                <Button onClick={handleSaveExchangeRate} disabled={savingExchangeRate || !exchangeRate} size="icon">
                  <Save className="h-4 w-4" />
                </Button>
              </div>
              {position?.monthlyExchangeRate && (
                <p className="text-xs text-muted-foreground">
                  Guardado: {position.monthlyExchangeRate}
                </p>
              )}
            </div>

            {/* Botón Actualizar */}
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button onClick={fetchPosition} disabled={loading} className="w-full">
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Actualizar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">Cargando posición contable...</div>
          </CardContent>
        </Card>
      ) : position ? (
        <>
          {/* KPIs Principales */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Total Activo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatUSD(position.activo.total)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  Total Pasivo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatUSD(position.pasivo.total)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-blue-500" />
                  Patrimonio Neto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-bold", position.patrimonio_neto >= 0 ? "text-blue-600" : "text-red-600")}>
                  {formatUSD(position.patrimonio_neto)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Resultado del Mes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn("text-2xl font-bold", position.resultado.resultado >= 0 ? "text-green-600" : "text-red-600")}>
                  {formatUSD(position.resultado.resultado)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detalle */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* ACTIVO */}
            <Card>
              <CardHeader>
                <CardTitle className="text-green-600">ACTIVO</CardTitle>
                <CardDescription>Recursos y bienes de la empresa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground">Activo Corriente</h4>
                  
                  <div className="flex justify-between items-center py-2 border-b">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-green-500" />
                      <span>Efectivo USD</span>
                    </div>
                    <span className="font-medium">{formatUSD(position.detalle.efectivo.usd)}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-blue-500" />
                      <span>Efectivo ARS</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium">{formatARS(position.detalle.efectivo.ars)}</span>
                      {position.monthlyExchangeRate && position.detalle.efectivo.ars > 0 && (
                        <p className="text-xs text-muted-foreground">
                          ≈ {formatUSD(position.detalle.efectivo.ars / position.monthlyExchangeRate)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-green-500" />
                      <span>Bancos USD</span>
                    </div>
                    <span className="font-medium">{formatUSD(position.detalle.bancos.usd)}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-blue-500" />
                      <span>Bancos ARS</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium">{formatARS(position.detalle.bancos.ars)}</span>
                      {position.monthlyExchangeRate && position.detalle.bancos.ars > 0 && (
                        <p className="text-xs text-muted-foreground">
                          ≈ {formatUSD(position.detalle.bancos.ars / position.monthlyExchangeRate)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b bg-yellow-50 dark:bg-yellow-950/30 px-2 rounded">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-yellow-600" />
                      <span className="font-medium">Cuentas por Cobrar</span>
                    </div>
                    <span className="font-bold text-yellow-600">{formatUSD(position.detalle.cuentasPorCobrar)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Lo que los clientes nos deben</p>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">Total Activo</span>
                    <span className="text-lg font-bold text-green-600">{formatUSD(position.activo.total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* PASIVO Y PATRIMONIO */}
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600">PASIVO Y PATRIMONIO NETO</CardTitle>
                <CardDescription>Obligaciones y capital</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-muted-foreground">Pasivo Corriente</h4>

                  <div className="flex justify-between items-center py-2 border-b bg-orange-50 dark:bg-orange-950/30 px-2 rounded">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-orange-600" />
                      <span className="font-medium">Cuentas por Pagar (Operadores)</span>
                    </div>
                    <span className="font-bold text-orange-600">{formatUSD(position.detalle.cuentasPorPagar)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Lo que debemos a operadores/proveedores</p>

                  <div className="flex justify-between items-center py-2 border-b">
                    <span>Gastos Recurrentes Pendientes (USD)</span>
                    <span className="font-medium">{formatUSD(position.detalle.gastosRecurrentesPendientes.usd)}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b">
                    <span>Gastos Recurrentes Pendientes (ARS)</span>
                    <div className="text-right">
                      <span className="font-medium">{formatARS(position.detalle.gastosRecurrentesPendientes.ars)}</span>
                      {position.monthlyExchangeRate && position.detalle.gastosRecurrentesPendientes.ars > 0 && (
                        <p className="text-xs text-muted-foreground">
                          ≈ {formatUSD(position.detalle.gastosRecurrentesPendientes.ars / position.monthlyExchangeRate)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Total Pasivo</span>
                    <span className="font-bold text-red-600">{formatUSD(position.pasivo.total)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Patrimonio Neto</span>
                    <span className={cn("font-bold", position.patrimonio_neto >= 0 ? "text-blue-600" : "text-red-600")}>
                      {formatUSD(position.patrimonio_neto)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-lg font-bold">Total Pasivo + Patrimonio</span>
                    <span className="text-lg font-bold">{formatUSD(position.pasivo.total + position.patrimonio_neto)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resultado del Mes */}
          <Card>
            <CardHeader>
              <CardTitle>Resultado del Mes</CardTitle>
              <CardDescription>
                Resumen de ingresos, costos y gastos de {format(selectedDate, "MMMM yyyy", { locale: es })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30">
                  <p className="text-sm text-muted-foreground mb-1">Ingresos (cobros)</p>
                  <p className="text-xl font-bold text-green-600">{formatUSD(position.resultado.ingresos.total)}</p>
                  <div className="text-xs text-muted-foreground mt-1">
                    <p>USD: {formatUSD(position.resultado.ingresos.usd)}</p>
                    <p>ARS: {formatARS(position.resultado.ingresos.ars)}</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/30">
                  <p className="text-sm text-muted-foreground mb-1">Costos (operadores)</p>
                  <p className="text-xl font-bold text-orange-600">{formatUSD(position.resultado.costos.total)}</p>
                  <div className="text-xs text-muted-foreground mt-1">
                    <p>USD: {formatUSD(position.resultado.costos.usd)}</p>
                    <p>ARS: {formatARS(position.resultado.costos.ars)}</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30">
                  <p className="text-sm text-muted-foreground mb-1">Gastos</p>
                  <p className="text-xl font-bold text-red-600">{formatUSD(position.resultado.gastos.total)}</p>
                  <div className="text-xs text-muted-foreground mt-1">
                    <p>USD: {formatUSD(position.resultado.gastos.usd)}</p>
                    <p>ARS: {formatARS(position.resultado.gastos.ars)}</p>
                  </div>
                </div>

                <div className={cn("p-4 rounded-lg", position.resultado.resultado >= 0 ? "bg-blue-50 dark:bg-blue-950/30" : "bg-red-100 dark:bg-red-950/50")}>
                  <p className="text-sm text-muted-foreground mb-1">Resultado</p>
                  <p className={cn("text-xl font-bold", position.resultado.resultado >= 0 ? "text-blue-600" : "text-red-600")}>
                    {formatUSD(position.resultado.resultado)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ingresos - Costos - Gastos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">No hay datos disponibles</div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
