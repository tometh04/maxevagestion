"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ReportsFiltersState } from "./reports-filters"
import { formatCurrency } from "@/lib/utils"

interface FinancialReportProps {
  filters: ReportsFiltersState
}

interface FinancialData {
  totalIncome: number
  totalExpenses: number
  netCashflow: number
  ivaToPay: number
  cashflow: Array<{
    date: string
    income: number
    expense: number
    net: number
  }>
}

export function FinancialReport({ filters }: FinancialReportProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<FinancialData | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("dateFrom", filters.dateFrom)
        params.set("dateTo", filters.dateTo)
        if (filters.agencyId !== "ALL") {
          params.set("agencyId", filters.agencyId)
        }

        const [cashflowRes, ivaRes] = await Promise.all([
          fetch(`/api/analytics/cashflow?${params.toString()}`),
          fetch(`/api/accounting/iva?${params.toString()}`),
        ])

        const cashflowData = await cashflowRes.json()
        const ivaData = await ivaRes.json()

        const cashflow = cashflowData.cashflow || []
        const totalIncome = cashflow.reduce((sum: number, item: any) => sum + item.income, 0)
        const totalExpenses = cashflow.reduce((sum: number, item: any) => sum + item.expense, 0)
        const netCashflow = totalIncome - totalExpenses

        // Calculate IVA to pay (simplified - sum of all months)
        const ivaToPay = (ivaData.monthlyIVA || []).reduce(
          (sum: number, month: any) => sum + (month.ivaToPay || 0),
          0
        )

        setData({
          totalIncome,
          totalExpenses,
          netCashflow,
          ivaToPay,
          cashflow,
        })
      } catch (error) {
        console.error("Error fetching financial report:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [filters])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No hay datos disponibles</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ingresos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(data.totalIncome)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Egresos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(data.totalExpenses)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flujo Neto</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                data.netCashflow >= 0 ? "text-amber-600" : "text-red-600"
              }`}
            >
              {formatCurrency(data.netCashflow)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">IVA a Pagar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.ivaToPay)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Cashflow Table */}
      {data.cashflow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Flujo de Caja Diario</CardTitle>
            <CardDescription>Ingresos y egresos por día</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Fecha</TableHead>
                    <TableHead className="text-right min-w-[120px]">Ingresos</TableHead>
                    <TableHead className="text-right min-w-[120px]">Egresos</TableHead>
                    <TableHead className="text-right min-w-[120px]">Neto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.cashflow.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        {new Date(item.date).toLocaleDateString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right text-amber-600">
                        {formatCurrency(item.income)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {formatCurrency(item.expense)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          item.net >= 0 ? "text-amber-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(item.net)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

