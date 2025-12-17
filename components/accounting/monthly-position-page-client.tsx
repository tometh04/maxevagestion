"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Download } from "lucide-react"
import { cn } from "@/lib/utils"

interface MonthlyPositionPageClientProps {
  agencies: Array<{ id: string; name: string }>
  userRole: string
}

interface MonthlyPosition {
  year: number
  month: number
  dateTo: string
  activo: {
    corriente: { ars: number; usd: number }
    no_corriente: { ars: number; usd: number }
    total: { ars: number; usd: number }
  }
  pasivo: {
    corriente: { ars: number; usd: number }
    no_corriente: { ars: number; usd: number }
    total: { ars: number; usd: number }
  }
  patrimonio_neto: {
    total: number
  }
  resultado: {
    ingresos: number
    costos: number
    gastos: number
    total: number
    ingresosARS?: number
    ingresosUSD?: number
    costosARS?: number
    costosUSD?: number
    gastosARS?: number
    gastosUSD?: number
    resultadoARS?: number
    resultadoUSD?: number
  }
}

function formatCurrency(amount: number, currency: "ARS" | "USD" = "ARS"): string {
  // Para USD, usar formato con punto como separador decimal
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }
  
  // Para ARS, usar formato argentino sin decimales
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
]

export function MonthlyPositionPageClient({ agencies, userRole }: MonthlyPositionPageClientProps) {
  const currentDate = new Date()
  const [year, setYear] = useState(currentDate.getFullYear())
  const [month, setMonth] = useState(currentDate.getMonth() + 1)
  const [agencyId, setAgencyId] = useState<string>("ALL")
  const [position, setPosition] = useState<MonthlyPosition | null>(null)
  const [loading, setLoading] = useState(true)
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  const fetchPosition = async () => {
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
      } else {
        console.error("Error fetching monthly position")
      }
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, agencyId])

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setYear(date.getFullYear())
      setMonth(date.getMonth() + 1)
      setDatePickerOpen(false)
    }
  }

  const selectedDate = new Date(year, month - 1, 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Posición Contable Mensual</h1>
          <p className="text-muted-foreground">Estado de situación patrimonial al cierre del mes</p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Mes y Año</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? (
                      format(selectedDate, "MMMM yyyy", { locale: es })
                    ) : (
                      <span>Seleccionar fecha</span>
                    )}
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
          {/* Resumen Ejecutivo */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Activo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(position.activo.total.ars, "ARS")}
                  {position.activo.total.usd > 0 && (
                    <span className="ml-2 text-muted-foreground">
                      ({formatCurrency(position.activo.total.usd, "USD")})
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Pasivo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(position.pasivo.total.ars, "ARS")}
                  {position.pasivo.total.usd > 0 && (
                    <span className="ml-2 text-muted-foreground">
                      ({formatCurrency(position.pasivo.total.usd, "USD")})
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Patrimonio Neto</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(position.patrimonio_neto.total)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Resultado del Mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${(position.resultado.resultadoARS || position.resultado.total) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(position.resultado.resultadoARS || position.resultado.total, "ARS")}
                  {position.resultado.resultadoUSD !== undefined && position.resultado.resultadoUSD !== 0 && (
                    <span className="ml-2 text-muted-foreground">
                      ({formatCurrency(position.resultado.resultadoUSD, "USD")})
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detalle por Rubros */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* ACTIVO */}
            <Card>
              <CardHeader>
                <CardTitle>ACTIVO</CardTitle>
                <CardDescription>Recursos y bienes de la empresa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Activo Corriente</span>
                    <div className="font-bold text-green-600">
                      {formatCurrency(position.activo.corriente.ars, "ARS")}
                      {position.activo.corriente.usd > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          ({formatCurrency(position.activo.corriente.usd, "USD")})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Caja, Bancos, Cuentas por Cobrar, Activos en Stock
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Activo No Corriente</span>
                    <div className="font-bold text-green-600">
                      {formatCurrency(position.activo.no_corriente.ars, "ARS")}
                      {position.activo.no_corriente.usd > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          ({formatCurrency(position.activo.no_corriente.usd, "USD")})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Inversiones a largo plazo
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">Total Activo</span>
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(position.activo.total.ars, "ARS")}
                      {position.activo.total.usd > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          ({formatCurrency(position.activo.total.usd, "USD")})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* PASIVO Y PATRIMONIO */}
            <Card>
              <CardHeader>
                <CardTitle>PASIVO Y PATRIMONIO NETO</CardTitle>
                <CardDescription>Obligaciones y capital</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Pasivo Corriente</span>
                    <div className="font-bold text-red-600">
                      {formatCurrency(position.pasivo.corriente.ars, "ARS")}
                      {position.pasivo.corriente.usd > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          ({formatCurrency(position.pasivo.corriente.usd, "USD")})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Cuentas por Pagar, IVA a Pagar, Sueldos a Pagar
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Pasivo No Corriente</span>
                    <div className="font-bold text-red-600">
                      {formatCurrency(position.pasivo.no_corriente.ars, "ARS")}
                      {position.pasivo.no_corriente.usd > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          ({formatCurrency(position.pasivo.no_corriente.usd, "USD")})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Préstamos a largo plazo
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Total Pasivo</span>
                    <div className="font-bold text-red-600">
                      {formatCurrency(position.pasivo.total.ars, "ARS")}
                      {position.pasivo.total.usd > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          ({formatCurrency(position.pasivo.total.usd, "USD")})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Patrimonio Neto</span>
                    <span className="font-bold text-blue-600">{formatCurrency(position.patrimonio_neto.total)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Capital, Reservas, Resultados Acumulados
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">Total Pasivo + Patrimonio</span>
                    <div className="text-lg font-bold">
                      {formatCurrency(position.pasivo.total.ars + position.patrimonio_neto.total, "ARS")}
                      {position.pasivo.total.usd > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          ({formatCurrency(position.pasivo.total.usd, "USD")})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RESULTADO DEL MES */}
          <Card>
            <CardHeader>
              <CardTitle>RESULTADO DEL MES ({monthNames[month - 1]} {year})</CardTitle>
              <CardDescription>Estado de resultados del período</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Ingresos</span>
                  <div className="font-bold text-green-600">
                    {formatCurrency(position.resultado.ingresosARS || 0, "ARS")}
                    {position.resultado.ingresosUSD !== undefined && position.resultado.ingresosUSD > 0 && (
                      <span className="ml-2 text-muted-foreground">
                        ({formatCurrency(position.resultado.ingresosUSD, "USD")})
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Ventas de Viajes, Otros Ingresos
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Costos</span>
                  <div className="font-bold text-red-600">
                    -{formatCurrency(position.resultado.costosARS || 0, "ARS")}
                    {position.resultado.costosUSD !== undefined && position.resultado.costosUSD > 0 && (
                      <span className="ml-2 text-muted-foreground">
                        (-{formatCurrency(position.resultado.costosUSD, "USD")})
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Costo de Operadores, Otros Costos
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Gastos</span>
                  <div className="font-bold text-red-600">
                    -{formatCurrency(position.resultado.gastosARS || 0, "ARS")}
                    {position.resultado.gastosUSD !== undefined && position.resultado.gastosUSD > 0 && (
                      <span className="ml-2 text-muted-foreground">
                        (-{formatCurrency(position.resultado.gastosUSD, "USD")})
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Gastos Administrativos, Comercialización, Comisiones, Gastos Financieros
                </div>
              </div>
              <div className="pt-2 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold">Resultado del Mes</span>
                  <span className={`text-lg font-bold ${position.resultado.total >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(position.resultado.total)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">No se pudo cargar la posición contable</div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

