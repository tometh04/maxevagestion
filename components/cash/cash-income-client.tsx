"use client"

import { useCallback, useMemo, useState } from "react"
import { CashFilters, CashFiltersState } from "./cash-filters"
import { MovementsTable } from "./movements-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/currency"
import { useCallback, useEffect } from "react"

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
      params.set("type", "INCOME")
      if (filters.agencyId !== "ALL") {
        params.set("agencyId", filters.agencyId)
      }
      if (filters.currency !== "ALL") {
        params.set("currency", filters.currency)
      }

      const response = await fetch(`/api/cash/movements?${params.toString()}&limit=1000`)
      if (response.ok) {
        const data = await response.json()
        const movements = data.movements || []
        
        const ars = movements
          .filter((m: any) => m.currency === "ARS")
          .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0)
        
        const usd = movements
          .filter((m: any) => m.currency === "USD")
          .reduce((sum: number, m: any) => sum + parseFloat(m.amount || 0), 0)

        setTotalIncome({ ars, usd })
      }
    } catch (error) {
      console.error("Error fetching total income:", error)
    }
  }, [filters])

  useEffect(() => {
    fetchTotalIncome()
  }, [fetchTotalIncome])

  const filtersWithType = useMemo(
    () => ({
      ...filters,
      type: "INCOME" as const,
    }),
    [filters]
  )

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

      <MovementsTable
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        currency={filters.currency}
        agencyId={filters.agencyId}
        type="INCOME"
        emptyMessage="No hay ingresos en el rango seleccionado"
      />
    </div>
  )
}

