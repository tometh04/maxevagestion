"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
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
import { useSortableData, SortableTableHead } from "@/components/ui/sortable-header"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function formatCurrency(amount: number, currency: string = "ARS"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "ARS",
    minimumFractionDigits: 2,
  }).format(amount)
}

interface IVAPageClientProps {
  agencies: Array<{ id: string; name: string }>
}

export function IVAPageClient({ agencies }: IVAPageClientProps) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [agencyFilter, setAgencyFilter] = useState<string>("ALL")
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    summary: {
      ars: {
        total_sales_iva: number
        total_purchases_iva: number
        iva_to_pay: number
        debito_fiscal: number
        credito_fiscal: number
        count_sales: number
        count_purchases: number
      }
      usd: {
        total_sales_iva: number
        total_purchases_iva: number
        iva_to_pay: number
        debito_fiscal: number
        credito_fiscal: number
        count_sales: number
        count_purchases: number
      }
      exempt_count: number
      exempt_base: number
      percepciones_iva: { ars: number; usd: number }
      iva_to_pay_adjusted: { ars: number; usd: number }
    }
    sales: any[]
    purchases: any[]
  } | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          year: year.toString(),
          month: month.toString(),
        })
        if (agencyFilter !== "ALL") {
          params.append("agencyId", agencyFilter)
        }
        const response = await fetch(`/api/accounting/iva?${params.toString()}`)
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
  }, [year, month, agencyFilter])

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

  const { sortedData: sortedSales, sortConfig: salesSortConfig, requestSort: requestSalesSort } = useSortableData(data?.sales || [], { key: "sale_date", direction: "desc" })
  const { sortedData: sortedPurchases, sortConfig: purchasesSortConfig, requestSort: requestPurchasesSort } = useSortableData(data?.purchases || [], { key: "purchase_date", direction: "desc" })

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
      {/* Period Selector - inline filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={handlePreviousMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Label className="text-lg font-semibold">
          {monthNames[month - 1]} {year}
        </Label>
        <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={handleNextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Select value={agencyFilter} onValueChange={setAgencyFilter}>
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
            <SelectValue />
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

      {/* Summary - KPI cards ARS */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Pesos (ARS)</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border/40 p-5">
            <p className="text-xs font-medium text-muted-foreground">Débito Fiscal (Ventas)</p>
            <div className="text-2xl font-semibold tabular-nums tracking-tight text-accent-coral mt-1">
              {formatCurrency(data.summary.ars.total_sales_iva)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{data.summary.ars.count_sales} operaciones</p>
          </div>
          <div className="rounded-xl border border-border/40 p-5">
            <p className="text-xs font-medium text-muted-foreground">Crédito Fiscal (Compras)</p>
            <div className="text-2xl font-semibold tabular-nums tracking-tight text-accent-teal mt-1">
              {formatCurrency(data.summary.ars.total_purchases_iva)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{data.summary.ars.count_purchases} compras</p>
          </div>
          <div className="rounded-xl border border-border/40 p-5">
            <p className="text-xs font-medium text-muted-foreground">IVA a Pagar</p>
            <div className="mt-1">
              <Badge
                variant={data.summary.ars.iva_to_pay >= 0 ? "destructive" : "default"}
                className="text-lg"
              >
                {formatCurrency(data.summary.ars.iva_to_pay)}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Summary - KPI cards USD (only if there are USD operations) */}
      {(data.summary.usd.count_sales > 0 || data.summary.usd.count_purchases > 0) && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Dólares (USD)</p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border/40 p-5">
              <p className="text-xs font-medium text-muted-foreground">Débito Fiscal (Ventas)</p>
              <div className="text-2xl font-semibold tabular-nums tracking-tight text-accent-coral mt-1">
                {formatCurrency(data.summary.usd.total_sales_iva, "USD")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{data.summary.usd.count_sales} operaciones</p>
            </div>
            <div className="rounded-xl border border-border/40 p-5">
              <p className="text-xs font-medium text-muted-foreground">Crédito Fiscal (Compras)</p>
              <div className="text-2xl font-semibold tabular-nums tracking-tight text-accent-teal mt-1">
                {formatCurrency(data.summary.usd.total_purchases_iva, "USD")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{data.summary.usd.count_purchases} compras</p>
            </div>
            <div className="rounded-xl border border-border/40 p-5">
              <p className="text-xs font-medium text-muted-foreground">IVA a Pagar</p>
              <div className="mt-1">
                <Badge
                  variant={data.summary.usd.iva_to_pay >= 0 ? "destructive" : "default"}
                  className="text-lg"
                >
                  {formatCurrency(data.summary.usd.iva_to_pay, "USD")}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sales IVA Table */}
      <div className="rounded-xl border border-border/40">
        <div className="p-5 pb-3">
          <h3 className="text-base font-semibold">IVA de Ventas</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Desglose de IVA en ventas del período</p>
        </div>
        <div className="px-5 pb-5">
          {data.sales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay ventas en este período
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="sale_date" sortConfig={salesSortConfig} onSort={requestSalesSort} className="sticky top-0 bg-background z-10">Fecha</SortableTableHead>
                    <SortableTableHead sortKey="operations.destination" sortConfig={salesSortConfig} onSort={requestSalesSort} className="sticky top-0 bg-background z-10">Operación</SortableTableHead>
                    <SortableTableHead sortKey="sale_amount_total" sortConfig={salesSortConfig} onSort={requestSalesSort} className="sticky top-0 bg-background z-10">Monto Total</SortableTableHead>
                    <SortableTableHead sortKey="net_amount" sortConfig={salesSortConfig} onSort={requestSalesSort} className="sticky top-0 bg-background z-10">Neto</SortableTableHead>
                    <SortableTableHead sortKey="iva_amount" sortConfig={salesSortConfig} onSort={requestSalesSort} className="sticky top-0 bg-background z-10">IVA</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>
                        {format(new Date(sale.sale_date), "dd/MM/yyyy", { locale: es })}
                      </TableCell>
                      <TableCell>
                        {sale.operation_id ? (
                          <Link href={`/operations/${sale.operation_id}`} className="text-primary hover:underline" prefetch={false}>
                            {sale.operations?.file_code || sale.operations?.destination || "-"}
                          </Link>
                        ) : (sale.operations?.file_code || sale.operations?.destination || "-")}
                      </TableCell>
                      <TableCell>{formatCurrency(sale.sale_amount_total, sale.currency)}</TableCell>
                      <TableCell>{formatCurrency(sale.net_amount, sale.currency)}</TableCell>
                      <TableCell className="font-medium text-accent-coral">
                        {formatCurrency(sale.iva_amount, sale.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Purchases IVA Table */}
      <div className="rounded-xl border border-border/40">
        <div className="p-5 pb-3">
          <h3 className="text-base font-semibold">IVA de Compras</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Desglose de IVA en compras del período</p>
        </div>
        <div className="px-5 pb-5">
          {data.purchases.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay compras en este período
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="purchase_date" sortConfig={purchasesSortConfig} onSort={requestPurchasesSort} className="sticky top-0 bg-background z-10">Fecha</SortableTableHead>
                    <SortableTableHead sortKey="operations.destination" sortConfig={purchasesSortConfig} onSort={requestPurchasesSort} className="sticky top-0 bg-background z-10">Operación</SortableTableHead>
                    <SortableTableHead sortKey="operators.name" sortConfig={purchasesSortConfig} onSort={requestPurchasesSort} className="sticky top-0 bg-background z-10">Operador</SortableTableHead>
                    <SortableTableHead sortKey="operator_cost_total" sortConfig={purchasesSortConfig} onSort={requestPurchasesSort} className="sticky top-0 bg-background z-10">Monto Total</SortableTableHead>
                    <SortableTableHead sortKey="net_amount" sortConfig={purchasesSortConfig} onSort={requestPurchasesSort} className="sticky top-0 bg-background z-10">Neto</SortableTableHead>
                    <SortableTableHead sortKey="iva_amount" sortConfig={purchasesSortConfig} onSort={requestPurchasesSort} className="sticky top-0 bg-background z-10">IVA</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPurchases.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell>
                        {format(new Date(purchase.purchase_date), "dd/MM/yyyy", { locale: es })}
                      </TableCell>
                      <TableCell>
                        {purchase.operation_id ? (
                          <Link href={`/operations/${purchase.operation_id}`} className="text-primary hover:underline" prefetch={false}>
                            {purchase.operations?.file_code || purchase.operations?.destination || "-"}
                          </Link>
                        ) : (purchase.operations?.file_code || purchase.operations?.destination || "-")}
                      </TableCell>
                      <TableCell>{purchase.operators?.name || "-"}</TableCell>
                      <TableCell>
                        {formatCurrency(purchase.operator_cost_total, purchase.currency)}
                      </TableCell>
                      <TableCell>{formatCurrency(purchase.net_amount, purchase.currency)}</TableCell>
                      <TableCell className="font-medium text-accent-teal">
                        {formatCurrency(purchase.iva_amount, purchase.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

