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

interface OperationAccountingSectionProps {
  operationId: string
  saleAmount?: number
  operatorCost?: number
  currency?: string
  commissionPercent?: number
}

export function OperationAccountingSection({ 
  operationId, 
  saleAmount = 0, 
  operatorCost = 0, 
  currency = "USD",
  commissionPercent = 10
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

  // Cálculos de rentabilidad
  const marginBruto = saleAmount - operatorCost
  const marginBrutoPercent = saleAmount > 0 ? (marginBruto / saleAmount) * 100 : 0
  
  // IVA (21%)
  // IVA Venta: calculado sobre la ganancia (margen)
  const ivaVentas = marginBruto > 0 ? marginBruto * 0.21 : 0
  // IVA Compra: calculado sobre el costo del operador
  const ivaCompras = operatorCost > 0 ? operatorCost * 0.21 / 1.21 : 0
  const ivaAPagar = ivaVentas - ivaCompras
  
  // Netos (sin IVA)
  // Venta neta: ganancia sin IVA
  const ventaNeta = marginBruto - ivaVentas
  // Costo neto: costo del operador sin IVA
  const costoNeto = operatorCost / 1.21
  const marginNeto = ventaNeta - costoNeto
  
  // Comisiones estimadas
  const comisionEstimada = marginBruto * (commissionPercent / 100)
  const gananciaFinal = marginBruto - comisionEstimada
  const gananciaFinalPercent = saleAmount > 0 ? (gananciaFinal / saleAmount) * 100 : 0
  
  // ROI
  const roi = operatorCost > 0 ? ((marginBruto / operatorCost) * 100) : 0

  // Para el gráfico de distribución
  const costoPercent = saleAmount > 0 ? (operatorCost / saleAmount) * 100 : 0
  const marginPercent = saleAmount > 0 ? (marginBruto / saleAmount) * 100 : 0

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
  const isProfitable = marginBruto > 0

  return (
    <div className="space-y-4">
      {/* KPIs principales - mismo estilo que dashboard */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {/* Margen Bruto */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Margen Bruto
            </CardTitle>
            {isProfitable ? (
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-lg font-bold lg:text-xl truncate">
              {formatCurrency(marginBruto, currency)}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              {isProfitable ? (
                <ArrowUp className="h-3 w-3 text-emerald-500" />
              ) : marginBruto < 0 ? (
                <ArrowDown className="h-3 w-3 text-red-500" />
              ) : (
                <Minus className="h-3 w-3 text-muted-foreground" />
              )}
              <span className={`text-[10px] font-medium ${isProfitable ? 'text-emerald-500' : marginBruto < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                {formatPercent(marginBrutoPercent)} del total
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
          <CardTitle className="text-base font-medium">Desglose de Rentabilidad</CardTitle>
          <CardDescription className="text-xs">Distribución de costos y márgenes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Barra de distribución */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Distribución del precio de venta</span>
                <span className="font-medium">{formatCurrency(saleAmount, currency)}</span>
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
                  <span>Costo: {formatCurrency(operatorCost, currency)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-primary"></div>
                  <span>Margen: {formatCurrency(marginBruto, currency)}</span>
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
                    <span className="text-muted-foreground">Venta Total</span>
                    <span className="font-medium">{formatCurrency(saleAmount, currency)}</span>
                  </div>
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
                    <span className="text-muted-foreground">Costo Operador</span>
                    <span className="font-medium">{formatCurrency(operatorCost, currency)}</span>
                  </div>
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
                    <span className="text-xs text-muted-foreground">Margen Bruto</span>
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {formatPercent(marginBrutoPercent)}
                    </Badge>
                  </div>
                  <p className="text-base font-bold">
                    {formatCurrency(marginBruto, currency)}
                  </p>
                  <Progress 
                    value={Math.min(Math.max(marginBrutoPercent, 0), 100)} 
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
