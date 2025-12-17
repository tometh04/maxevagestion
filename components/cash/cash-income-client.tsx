"use client"

import { useCallback, useEffect, useState } from "react"
import { CashFilters, CashFiltersState } from "./cash-filters"
import { PaymentsTable, Payment } from "./payments-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/currency"

interface CashIncomeClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultFilters: CashFiltersState
}

export function CashIncomeClient({ agencies, defaultFilters }: CashIncomeClientProps) {
  const [filters, setFilters] = useState(defaultFilters)
  const [totalIncome, setTotalIncome] = useState({ ars: 0, usd: 0 })

  const fetchTotalIncome = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set("dateFrom", filters.dateFrom)
      params.set("dateTo", filters.dateTo)
      params.set("direction", "INCOME")
      params.set("limit", "1000")
      if (filters.agencyId !== "ALL") {
        params.set("agencyId", filters.agencyId)
      }
      if (filters.currency !== "ALL") {
        params.set("currency", filters.currency)
      }

      const response = await fetch(`/api/payments?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        const payments = data.payments || []
        
        const ars = payments
          .filter((p: Payment) => p.currency === "ARS")
          .reduce((sum: number, p: Payment) => sum + parseFloat(p.amount.toString()), 0)
        
        const usd = payments
          .filter((p: Payment) => p.currency === "USD")
          .reduce((sum: number, p: Payment) => sum + parseFloat(p.amount.toString()), 0)

        setTotalIncome({ ars, usd })
      }
    } catch (error) {
      console.error("Error fetching total income:", error)
    }
  }, [filters])

  useEffect(() => {
    fetchTotalIncome()
  }, [fetchTotalIncome])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ingresos</h1>
        <p className="text-muted-foreground">Todos los ingresos de las operaciones</p>
      </div>

      <CashFilters agencies={agencies} value={filters} defaultValue={defaultFilters} onChange={setFilters} />

      {/* KPIs de totales */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ingresos ARS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalIncome.ars, "ARS")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ingresos USD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalIncome.usd, "USD")}</div>
          </CardContent>
        </Card>
      </div>

      <PaymentsTable
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        currency={filters.currency}
        agencyId={filters.agencyId}
        direction="INCOME"
        emptyMessage="No hay ingresos en el rango seleccionado"
      />
    </div>
  )
}

