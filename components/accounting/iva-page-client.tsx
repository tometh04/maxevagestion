"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { ChevronLeft, ChevronRight } from "lucide-react"

function formatCurrency(amount: number, currency: string = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

export function IVAPageClient() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    summary: {
      total_sales_iva: number
      total_purchases_iva: number
      iva_to_pay: number
    }
    sales: any[]
    purchases: any[]
  } | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const response = await fetch(`/api/accounting/iva?year=${year}&month=${month}`)
        if (!response.ok) throw new Error("Error al obtener datos de IVA")

        const result = await response.json()
        setData(result)
      } catch (error) {
        console.error("Error fetching IVA data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [year, month])

  const handlePreviousMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!data) {
    return <div className="text-center py-8 text-muted-foreground">No se encontraron datos</div>
  }

  const monthNames = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ]

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <Label className="text-lg font-semibold">
                {monthNames[month - 1]} {year}
              </Label>
            </div>
            <Button variant="outline" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">IVA Ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(data.summary.total_sales_iva)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">IVA Compras</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(data.summary.total_purchases_iva)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">IVA a Pagar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge
                variant={data.summary.iva_to_pay >= 0 ? "destructive" : "default"}
                className="text-lg"
              >
                {formatCurrency(data.summary.iva_to_pay)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales IVA Table */}
      <Card>
        <CardHeader>
          <CardTitle>IVA de Ventas</CardTitle>
          <CardDescription>Desglose de IVA en ventas del período</CardDescription>
        </CardHeader>
        <CardContent>
          {data.sales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay ventas en este período
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead>Monto Total</TableHead>
                  <TableHead>Neto</TableHead>
                  <TableHead>IVA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      {format(new Date(sale.sale_date), "dd/MM/yyyy", { locale: es })}
                    </TableCell>
                    <TableCell>
                      {sale.operations?.file_code || sale.operations?.destination || "-"}
                    </TableCell>
                    <TableCell>{formatCurrency(sale.sale_amount_total, sale.currency)}</TableCell>
                    <TableCell>{formatCurrency(sale.net_amount, sale.currency)}</TableCell>
                    <TableCell className="font-medium text-amber-600">
                      {formatCurrency(sale.iva_amount, sale.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Purchases IVA Table */}
      <Card>
        <CardHeader>
          <CardTitle>IVA de Compras</CardTitle>
          <CardDescription>Desglose de IVA en compras del período</CardDescription>
        </CardHeader>
        <CardContent>
          {data.purchases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay compras en este período
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Monto Total</TableHead>
                  <TableHead>Neto</TableHead>
                  <TableHead>IVA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.purchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell>
                      {format(new Date(purchase.purchase_date), "dd/MM/yyyy", { locale: es })}
                    </TableCell>
                    <TableCell>
                      {purchase.operations?.file_code || purchase.operations?.destination || "-"}
                    </TableCell>
                    <TableCell>{purchase.operators?.name || "-"}</TableCell>
                    <TableCell>
                      {formatCurrency(purchase.operator_cost_total, purchase.currency)}
                    </TableCell>
                    <TableCell>{formatCurrency(purchase.net_amount, purchase.currency)}</TableCell>
                    <TableCell className="font-medium text-blue-600">
                      {formatCurrency(purchase.iva_amount, purchase.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

