"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { format } from "date-fns"
import { es } from "date-fns/locale"

function formatCurrency(amount: number, currency: string = "ARS"): string {
  const prefix = currency === "USD" ? "US$" : "$"
  return `${prefix} ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
}

interface OperationAccountingSectionProps {
  operationId: string
}

export function OperationAccountingSection({ operationId }: OperationAccountingSectionProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    ivaSales: any[]
    ivaPurchases: any[]
  } | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        // Solo obtener datos de IVA para esta operación
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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const hasIvaData = data && (data.ivaSales.length > 0 || data.ivaPurchases.length > 0)

  return (
    <div className="space-y-6">
      {/* IVA Section */}
      <Card>
        <CardHeader>
          <CardTitle>IVA de la Operación</CardTitle>
          <CardDescription>Desglose de IVA en ventas y compras de esta operación</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasIvaData ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay registros de IVA para esta operación
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {/* IVA Ventas */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  IVA Ventas (Débito Fiscal)
                </h4>
                {data.ivaSales.length > 0 ? (
                  data.ivaSales.map((sale) => (
                    <div key={sale.id} className="p-4 rounded-lg border bg-muted/30 space-y-2">
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
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  IVA Compras (Crédito Fiscal)
                </h4>
                {data.ivaPurchases.length > 0 ? (
                  data.ivaPurchases.map((purchase) => (
                    <div key={purchase.id} className="p-4 rounded-lg border bg-muted/30 space-y-2">
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
          )}
        </CardContent>
      </Card>

      {/* Nota informativa */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            <strong>Nota:</strong> Los registros de IVA se generan automáticamente al crear la operación. 
            El IVA de ventas representa el débito fiscal (lo que debés a AFIP), 
            mientras que el IVA de compras es crédito fiscal (lo que podés deducir).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
