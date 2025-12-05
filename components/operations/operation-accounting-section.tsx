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
  PieChart,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
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
  const ivaVentas = saleAmount > 0 ? saleAmount * 0.21 / 1.21 : 0
  const ivaCompras = operatorCost > 0 ? operatorCost * 0.21 / 1.21 : 0
  const ivaAPagar = ivaVentas - ivaCompras
  
  // Netos (sin IVA)
  const ventaNeta = saleAmount / 1.21
  const costoNeto = operatorCost / 1.21
  const marginNeto = ventaNeta - costoNeto
  const marginNetoPercent = ventaNeta > 0 ? (marginNeto / ventaNeta) * 100 : 0
  
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
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  const hasIvaData = data && (data.ivaSales.length > 0 || data.ivaPurchases.length > 0)
  const isProfitable = marginBruto > 0

  return (
    <div className="space-y-6">
      {/* KPIs principales */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Margen Bruto */}
        <Card className={`border-l-4 ${isProfitable ? 'border-l-green-500' : 'border-l-red-500'}`}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Margen Bruto</p>
                <p className={`text-2xl font-bold ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(marginBruto, currency)}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {isProfitable ? (
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                  )}
                  <span className={`text-sm font-medium ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercent(marginBrutoPercent)}
                  </span>
                  <span className="text-xs text-muted-foreground">del total</span>
                </div>
              </div>
              <div className={`p-3 rounded-full ${isProfitable ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                {isProfitable ? (
                  <TrendingUp className={`h-5 w-5 ${isProfitable ? 'text-green-600' : 'text-red-600'}`} />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ROI */}
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">ROI</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatPercent(roi)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Retorno sobre inversión
                </p>
              </div>
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Percent className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* IVA a Pagar */}
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">IVA Posición</p>
                <p className={`text-2xl font-bold ${ivaAPagar >= 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {formatCurrency(Math.abs(ivaAPagar), currency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {ivaAPagar >= 0 ? 'A pagar a AFIP' : 'Crédito fiscal'}
                </p>
              </div>
              <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Calculator className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ganancia Final Estimada */}
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Ganancia Neta</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatCurrency(gananciaFinal, currency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Después de comisión ({commissionPercent}%)
                </p>
              </div>
              <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Desglose visual de la operación */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Desglose de la Operación
          </CardTitle>
          <CardDescription>Visualización de costos, márgenes y ganancias</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Barra de distribución */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Distribución del Precio de Venta</span>
                <span className="text-muted-foreground">{formatCurrency(saleAmount, currency)}</span>
              </div>
              <div className="h-8 rounded-full overflow-hidden flex bg-muted">
                <div 
                  className="bg-red-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                  style={{ width: `${Math.min(costoPercent, 100)}%` }}
                >
                  {costoPercent > 15 && `Costo ${formatPercent(costoPercent)}`}
                </div>
                <div 
                  className="bg-green-500 flex items-center justify-center text-white text-xs font-medium transition-all"
                  style={{ width: `${Math.max(marginPercent, 0)}%` }}
                >
                  {marginPercent > 10 && `Margen ${formatPercent(marginPercent)}`}
                </div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-red-500"></div>
                  <span>Costo Operador: {formatCurrency(operatorCost, currency)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-green-500"></div>
                  <span>Margen: {formatCurrency(marginBruto, currency)}</span>
                </div>
              </div>
            </div>

            {/* Tabla de desglose detallado */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Ingresos */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-green-600 uppercase tracking-wide flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4" />
                  Ingresos
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between p-2 rounded bg-green-50 dark:bg-green-900/20">
                    <span>Venta Total (con IVA)</span>
                    <span className="font-semibold">{formatCurrency(saleAmount, currency)}</span>
                  </div>
                  <div className="flex justify-between p-2">
                    <span className="text-muted-foreground">Venta Neta (sin IVA)</span>
                    <span>{formatCurrency(ventaNeta, currency)}</span>
                  </div>
                  <div className="flex justify-between p-2">
                    <span className="text-muted-foreground">IVA Débito Fiscal</span>
                    <span className="text-amber-600">{formatCurrency(ivaVentas, currency)}</span>
                  </div>
                </div>
              </div>

              {/* Costos */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-red-600 uppercase tracking-wide flex items-center gap-2">
                  <ArrowDownRight className="h-4 w-4" />
                  Costos
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between p-2 rounded bg-red-50 dark:bg-red-900/20">
                    <span>Costo Operador (con IVA)</span>
                    <span className="font-semibold">{formatCurrency(operatorCost, currency)}</span>
                  </div>
                  <div className="flex justify-between p-2">
                    <span className="text-muted-foreground">Costo Neto (sin IVA)</span>
                    <span>{formatCurrency(costoNeto, currency)}</span>
                  </div>
                  <div className="flex justify-between p-2">
                    <span className="text-muted-foreground">IVA Crédito Fiscal</span>
                    <span className="text-blue-600">-{formatCurrency(ivaCompras, currency)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Resumen de márgenes */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <PieChart className="h-4 w-4" />
                Resumen de Rentabilidad
              </h4>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Margen Bruto</span>
                    <Badge variant={marginBruto >= 0 ? "default" : "destructive"} className="text-xs">
                      {formatPercent(marginBrutoPercent)}
                    </Badge>
                  </div>
                  <p className={`text-xl font-bold ${marginBruto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(marginBruto, currency)}
                  </p>
                  <Progress 
                    value={Math.min(Math.max(marginBrutoPercent, 0), 100)} 
                    className="h-2 mt-2"
                  />
                </div>

                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Comisión Vendedor</span>
                    <Badge variant="secondary" className="text-xs">
                      {commissionPercent}%
                    </Badge>
                  </div>
                  <p className="text-xl font-bold text-orange-600">
                    -{formatCurrency(comisionEstimada, currency)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Sobre margen bruto
                  </p>
                </div>

                <div className="p-4 rounded-lg border-2 border-purple-500 bg-purple-50 dark:bg-purple-900/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Ganancia Final</span>
                    <Badge className="text-xs bg-purple-600">
                      {formatPercent(gananciaFinalPercent)}
                    </Badge>
                  </div>
                  <p className="text-xl font-bold text-purple-600">
                    {formatCurrency(gananciaFinal, currency)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Utilidad neta de la operación
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* IVA Section (detalle fiscal) */}
      {hasIvaData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Detalle de IVA Fiscal
            </CardTitle>
            <CardDescription>Registros de IVA para presentación ante AFIP</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* IVA Ventas */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-amber-600 uppercase tracking-wide">
                  IVA Ventas (Débito Fiscal)
                </h4>
                {data?.ivaSales && data.ivaSales.length > 0 ? (
                  data.ivaSales.map((sale: any) => (
                    <div key={sale.id} className="p-4 rounded-lg border bg-amber-50 dark:bg-amber-900/10 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Total facturado</span>
                        <span className="font-medium">{formatCurrency(sale.sale_amount_total, sale.currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Neto gravado</span>
                        <span>{formatCurrency(sale.net_amount, sale.currency)}</span>
                      </div>
                      <div className="flex justify-between text-amber-600">
                        <span className="text-sm font-medium">IVA 21%</span>
                        <span className="font-semibold">{formatCurrency(sale.iva_amount, sale.currency)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sin registros de venta</p>
                )}
              </div>

              {/* IVA Compras */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-blue-600 uppercase tracking-wide">
                  IVA Compras (Crédito Fiscal)
                </h4>
                {data?.ivaPurchases && data.ivaPurchases.length > 0 ? (
                  data.ivaPurchases.map((purchase: any) => (
                    <div key={purchase.id} className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/10 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Total pagado</span>
                        <span className="font-medium">{formatCurrency(purchase.operator_cost_total, purchase.currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Neto gravado</span>
                        <span>{formatCurrency(purchase.net_amount, purchase.currency)}</span>
                      </div>
                      <div className="flex justify-between text-blue-600">
                        <span className="text-sm font-medium">IVA 21%</span>
                        <span className="font-semibold">{formatCurrency(purchase.iva_amount, purchase.currency)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Sin registros de compra</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nota informativa */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="shrink-0">
              <Badge variant="outline" className="text-xs">Info</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Los cálculos de IVA asumen facturación con 21%. El margen bruto es la diferencia entre 
              venta y costo. La comisión del vendedor se calcula sobre el margen bruto. 
              La ganancia final es lo que queda después de comisiones.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
