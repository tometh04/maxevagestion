"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Percent, 
  Calculator,
  Receipt,
  ArrowUp,
  ArrowDown,
  Minus
} from "lucide-react"

function formatCurrency(amount: number, currency: string = "ARS"): string {
  const prefix = currency === "USD" ? "US$" : "$"
  return `${prefix} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

interface OperationService {
  id: string
  service_type: string
  name?: string | null
  price: number
  cost: number
  currency: "ARS" | "USD"
  generates_commission: boolean
}

interface OperationAccountingSectionProps {
  operationId: string
  saleAmount?: number
  operatorCost?: number
  currency?: string
  commissionPercent?: number
  operationServices?: OperationService[]
}

const serviceTypeLabels: Record<string, string> = {
  SEAT: "Asiento",
  LUGGAGE: "Equipaje",
  VISA: "Visado",
  TRANSFER: "Traslado/Transfer",
  ASSISTANCE: "Asistencia",
}

export function OperationAccountingSection({
  operationId,
  saleAmount = 0,
  operatorCost = 0,
  currency = "USD",
  commissionPercent = 10,
  operationServices = [],
}: OperationAccountingSectionProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    ivaSales: any[]
    ivaPurchases: any[]
  } | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [ivaSalesRes, ivaPurchasesRes] = await Promise.all([
          fetch(`/api/accounting/iva?operationId=${operationId}`).catch(() => null),
          fetch(`/api/accounting/iva?operationId=${operationId}&type=purchases`).catch(() => null),
        ])

        const ivaSales = ivaSalesRes?.ok ? (await ivaSalesRes.json()).sales || [] : []
        const ivaPurchases = ivaPurchasesRes?.ok ? (await ivaPurchasesRes.json()).purchases || [] : []

        setData({ ivaSales, ivaPurchases })
      } catch (error) {
        console.error("Error fetching accounting data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [operationId])

  // ── Cálculo de Servicios (separados por moneda) ──────────────────────────
  const servicesInOpCurrency = operationServices.filter(s => s.currency === currency)
  const servicesInOtherCurrency = operationServices.filter(s => s.currency !== currency)

  // Totales de servicios en la misma moneda que la operación base
  const servicesSaleInOp = servicesInOpCurrency.reduce((sum, s) => sum + Number(s.price), 0)
  const servicesCostInOp = servicesInOpCurrency.reduce((sum, s) => sum + Number(s.cost), 0)
  const servicesMarginInOp = servicesSaleInOp - servicesCostInOp

  // Comisión de servicios que la generan
  const commissionableServicesInOp = servicesInOpCurrency.filter(s => s.generates_commission)
  const servicesComissionInOp = commissionableServicesInOp.reduce(
    (sum, s) => sum + (Number(s.price) - Number(s.cost)) * (commissionPercent / 100),
    0
  )

  // Totales de servicios en moneda alternativa
  const otherCurrency = currency === "USD" ? "ARS" : "USD"
  const servicesSaleOther = servicesInOtherCurrency.reduce((sum, s) => sum + Number(s.price), 0)
  const servicesCostOther = servicesInOtherCurrency.reduce((sum, s) => sum + Number(s.cost), 0)

  // ── Cálculos de rentabilidad TOTAL (base + servicios misma moneda) ────────
  const totalSale = saleAmount + servicesSaleInOp
  const totalCost = operatorCost + servicesCostInOp
  const totalMargin = totalSale - totalCost
  const totalMarginPercent = totalSale > 0 ? (totalMargin / totalSale) * 100 : 0
  const totalComision = (saleAmount - operatorCost) * (commissionPercent / 100) + servicesComissionInOp
  const totalGanancia = totalMargin - totalComision
  const totalGananciaPercent = totalSale > 0 ? (totalGanancia / totalSale) * 100 : 0

  const hasServices = operationServices.length > 0

  // ── Cálculos legacy (base sola — para gráfico de distribución) ───────────
  const marginBruto = saleAmount - operatorCost
  const marginBrutoPercent = saleAmount > 0 ? (marginBruto / saleAmount) * 100 : 0

  // IVA (21%) — sobre totales
  const ivaVentas = totalMargin > 0 ? totalMargin * 0.21 : 0
  const ivaCompras = totalCost > 0 ? totalCost * 0.21 / 1.21 : 0
  const ivaAPagar = ivaVentas - ivaCompras

  // Netos (sin IVA)
  const ventaNeta = totalMargin - ivaVentas
  const costoNeto = totalCost / 1.21
  const marginNeto = ventaNeta - costoNeto

  // Comisiones / ganancia final (TOTAL)
  const comisionEstimada = totalComision
  const gananciaFinal = totalGanancia
  const gananciaFinalPercent = totalGananciaPercent

  // ROI
  const roi = totalCost > 0 ? (totalMargin / totalCost) * 100 : 0

  // Para el gráfico de distribución
  // Gráfico de distribución — usa totales (base + servicios misma moneda)
  const costoPercent = totalSale > 0 ? (totalCost / totalSale) * 100 : 0
  const marginPercent = totalSale > 0 ? (totalMargin / totalSale) * 100 : 0

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  const hasIvaData = data && (data.ivaSales.length > 0 || data.ivaPurchases.length > 0)
  const isProfitable = totalMargin > 0

  return (
    <div className="space-y-4">
      {/* KPIs principales - mismo estilo que dashboard */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {/* Margen Bruto TOTAL */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Margen Bruto{hasServices ? " (Total)" : ""}
            </CardTitle>
            {isProfitable ? (
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-lg font-bold lg:text-xl truncate">
              {formatCurrency(totalMargin, currency)}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              {isProfitable ? (
                <ArrowUp className="h-3 w-3 text-emerald-500" />
              ) : totalMargin < 0 ? (
                <ArrowDown className="h-3 w-3 text-red-500" />
              ) : (
                <Minus className="h-3 w-3 text-muted-foreground" />
              )}
              <span className={`text-[10px] font-medium ${isProfitable ? 'text-emerald-500' : totalMargin < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                {formatPercent(totalMarginPercent)} del total
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ROI */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              ROI
            </CardTitle>
            <Percent className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-lg font-bold lg:text-xl">
              {formatPercent(roi)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Retorno sobre inversión
            </p>
          </CardContent>
        </Card>

        {/* IVA Posición */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Posición IVA
            </CardTitle>
            <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className={`text-lg font-bold lg:text-xl truncate ${ivaAPagar >= 0 ? 'text-amber-600' : ''}`}>
              {formatCurrency(Math.abs(ivaAPagar), currency)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {ivaAPagar >= 0 ? 'A pagar a AFIP' : 'Crédito fiscal'}
            </p>
          </CardContent>
        </Card>

        {/* Ganancia Neta */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Ganancia Neta
            </CardTitle>
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-lg font-bold lg:text-xl truncate">
              {formatCurrency(gananciaFinal, currency)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Después de comisión ({commissionPercent}%)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Desglose de la operación */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            Desglose de Rentabilidad{hasServices ? " (Base + Servicios)" : ""}
          </CardTitle>
          <CardDescription className="text-xs">Distribución de costos y márgenes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Barra de distribución */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Distribución del precio de venta{hasServices ? " (total)" : ""}</span>
                <span className="font-medium">{formatCurrency(totalSale, currency)}</span>
              </div>
              <div className="h-6 rounded-md overflow-hidden flex bg-muted">
                <div 
                  className="bg-muted-foreground/40 flex items-center justify-center text-[10px] font-medium text-foreground transition-all"
                  style={{ width: `${Math.min(costoPercent, 100)}%` }}
                >
                  {costoPercent > 20 && `${formatPercent(costoPercent)}`}
                </div>
                <div 
                  className="bg-primary flex items-center justify-center text-[10px] font-medium text-primary-foreground transition-all"
                  style={{ width: `${Math.max(marginPercent, 0)}%` }}
                >
                  {marginPercent > 15 && `${formatPercent(marginPercent)}`}
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/40"></div>
                  <span>Costo: {formatCurrency(totalCost, currency)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-primary"></div>
                  <span>Margen: {formatCurrency(totalMargin, currency)}</span>
                </div>
              </div>
            </div>

            {/* Tabla de desglose */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Ingresos */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Ingresos
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between py-1.5 px-2 rounded bg-muted/50">
                    <span className="text-muted-foreground">
                      Venta Total{hasServices ? " (base + servicios)" : ""}
                    </span>
                    <span className="font-medium">{formatCurrency(totalSale, currency)}</span>
                  </div>
                  {hasServices && servicesSaleInOp > 0 && (
                    <div className="flex justify-between py-1 px-2 text-xs text-muted-foreground">
                      <span className="pl-2">↳ Base: {formatCurrency(saleAmount, currency)}</span>
                      <span>Servicios: +{formatCurrency(servicesSaleInOp, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5 px-2">
                    <span className="text-muted-foreground text-xs">Neto (sin IVA)</span>
                    <span className="text-xs">{formatCurrency(ventaNeta, currency)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 px-2">
                    <span className="text-muted-foreground text-xs">IVA Débito</span>
                    <span className="text-xs text-amber-600">{formatCurrency(ivaVentas, currency)}</span>
                  </div>
                </div>
              </div>

              {/* Costos */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Costos
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between py-1.5 px-2 rounded bg-muted/50">
                    <span className="text-muted-foreground">
                      Costo Total{hasServices ? " (base + servicios)" : ""}
                    </span>
                    <span className="font-medium">{formatCurrency(totalCost, currency)}</span>
                  </div>
                  {hasServices && servicesCostInOp > 0 && (
                    <div className="flex justify-between py-1 px-2 text-xs text-muted-foreground">
                      <span className="pl-2">↳ Operador: {formatCurrency(operatorCost, currency)}</span>
                      <span>Servicios: +{formatCurrency(servicesCostInOp, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1.5 px-2">
                    <span className="text-muted-foreground text-xs">Neto (sin IVA)</span>
                    <span className="text-xs">{formatCurrency(costoNeto, currency)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 px-2">
                    <span className="text-muted-foreground text-xs">IVA Crédito</span>
                    <span className="text-xs">-{formatCurrency(ivaCompras, currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Resumen */}
            <div className="border-t pt-4">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Resumen
              </h4>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="p-3 rounded-lg border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">
                      Margen Bruto{hasServices ? " Total" : ""}
                    </span>
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {formatPercent(totalMarginPercent)}
                    </Badge>
                  </div>
                  <p className="text-base font-bold">
                    {formatCurrency(totalMargin, currency)}
                  </p>
                  <Progress
                    value={Math.min(Math.max(totalMarginPercent, 0), 100)}
                    className="h-1.5 mt-2"
                  />
                </div>

                <div className="p-3 rounded-lg border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Comisión</span>
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {commissionPercent}%
                    </Badge>
                  </div>
                  <p className="text-base font-bold text-amber-600">
                    -{formatCurrency(comisionEstimada, currency)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Sobre margen bruto
                  </p>
                </div>

                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">Utilidad Final</span>
                    <Badge variant="default" className="text-[10px] h-5">
                      {formatPercent(gananciaFinalPercent)}
                    </Badge>
                  </div>
                  <p className="text-base font-bold">
                    {formatCurrency(gananciaFinal, currency)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Ganancia neta
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Servicios adicionales */}
      {hasServices && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Servicios Adicionales</CardTitle>
            <CardDescription className="text-xs">
              Desglose de servicios incluidos en los totales de rentabilidad
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Operación base */}
              <div className="flex items-center justify-between px-2 py-1.5 rounded bg-muted/40 text-sm">
                <span className="font-medium text-muted-foreground">Operación base</span>
                <div className="flex gap-6 text-xs text-right">
                  <div>
                    <div className="text-muted-foreground">Venta</div>
                    <div className="font-medium">{formatCurrency(saleAmount, currency)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Costo</div>
                    <div className="font-medium">{formatCurrency(operatorCost, currency)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Margen</div>
                    <div className="font-medium text-emerald-600">{formatCurrency(marginBruto, currency)}</div>
                  </div>
                </div>
              </div>

              {/* Servicios en misma moneda */}
              {servicesInOpCurrency.map(service => (
                <div key={service.id} className="flex items-center justify-between px-2 py-1.5 rounded border text-sm">
                  <div>
                    <span className="font-medium">{service.name || serviceTypeLabels[service.service_type] || service.service_type}</span>
                    <div className="flex gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {service.currency}
                      </Badge>
                      {service.generates_commission ? (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-amber-100 text-amber-700">
                          Comisiona
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground">
                          Sin comisión
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-6 text-xs text-right">
                    <div>
                      <div className="text-muted-foreground">Venta</div>
                      <div className="font-medium">{formatCurrency(service.price, service.currency)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Costo</div>
                      <div className="font-medium">{formatCurrency(service.cost, service.currency)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Margen</div>
                      <div className={`font-medium ${(service.price - service.cost) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {formatCurrency(service.price - service.cost, service.currency)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Servicios en otra moneda (separados) */}
              {servicesInOtherCurrency.map(service => (
                <div key={service.id} className="flex items-center justify-between px-2 py-1.5 rounded border border-dashed text-sm">
                  <div>
                    <span className="font-medium">{service.name || serviceTypeLabels[service.service_type] || service.service_type}</span>
                    <div className="flex gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-[10px] h-4 px-1 bg-blue-50 text-blue-600 border-blue-200">
                        {service.currency} — otra moneda
                      </Badge>
                      {service.generates_commission ? (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-amber-100 text-amber-700">
                          Comisiona
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-6 text-xs text-right">
                    <div>
                      <div className="text-muted-foreground">Venta</div>
                      <div className="font-medium">{formatCurrency(service.price, service.currency)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Costo</div>
                      <div className="font-medium">{formatCurrency(service.cost, service.currency)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Margen</div>
                      <div className={`font-medium ${(service.price - service.cost) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {formatCurrency(service.price - service.cost, service.currency)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Totales */}
              <div className="border-t pt-2 mt-1 space-y-1">
                <div className="flex justify-between px-2 py-1 rounded bg-primary/5 font-medium text-sm">
                  <span>Total {currency}</span>
                  <div className="flex gap-6 text-xs text-right">
                    <div>
                      <div className="text-muted-foreground">Venta</div>
                      <div className="font-bold">{formatCurrency(totalSale, currency)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Costo</div>
                      <div className="font-bold">{formatCurrency(totalCost, currency)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Margen</div>
                      <div className="font-bold text-emerald-600">{formatCurrency(totalMargin, currency)}</div>
                    </div>
                  </div>
                </div>

                {servicesInOtherCurrency.length > 0 && (
                  <div className="flex justify-between px-2 py-1 rounded bg-blue-50 font-medium text-sm">
                    <span className="text-blue-700">Total {otherCurrency} (servicios)</span>
                    <div className="flex gap-6 text-xs text-right text-blue-700">
                      <div>
                        <div className="text-blue-500">Venta</div>
                        <div className="font-bold">{formatCurrency(servicesSaleOther, otherCurrency)}</div>
                      </div>
                      <div>
                        <div className="text-blue-500">Costo</div>
                        <div className="font-bold">{formatCurrency(servicesCostOther, otherCurrency)}</div>
                      </div>
                      <div>
                        <div className="text-blue-500">Margen</div>
                        <div className="font-bold">{formatCurrency(servicesSaleOther - servicesCostOther, otherCurrency)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detalle IVA fiscal */}
      {hasIvaData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Detalle Fiscal
            </CardTitle>
            <CardDescription className="text-xs">Registros de IVA para AFIP</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {/* IVA Ventas */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  IVA Ventas (Débito)
                </h4>
                {data?.ivaSales && data.ivaSales.length > 0 ? (
                  data.ivaSales.map((sale: any) => (
                    <div key={sale.id} className="p-3 rounded-lg border space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total facturado</span>
                        <span className="font-medium">{formatCurrency(sale.sale_amount_total, sale.currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Neto gravado</span>
                        <span>{formatCurrency(sale.net_amount, sale.currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">IVA 21%</span>
                        <span className="font-medium text-amber-600">{formatCurrency(sale.iva_amount, sale.currency)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Sin registros</p>
                )}
              </div>

              {/* IVA Compras */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  IVA Compras (Crédito)
                </h4>
                {data?.ivaPurchases && data.ivaPurchases.length > 0 ? (
                  data.ivaPurchases.map((purchase: any) => (
                    <div key={purchase.id} className="p-3 rounded-lg border space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total pagado</span>
                        <span className="font-medium">{formatCurrency(purchase.operator_cost_total, purchase.currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Neto gravado</span>
                        <span>{formatCurrency(purchase.net_amount, purchase.currency)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">IVA 21%</span>
                        <span className="font-medium">{formatCurrency(purchase.iva_amount, purchase.currency)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Sin registros</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
