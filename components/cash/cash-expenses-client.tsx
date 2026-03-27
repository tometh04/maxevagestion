"use client"

import { useCallback, useEffect, useState } from "react"
import { CashFilters, CashFiltersState } from "./cash-filters"
import { PaymentsTable, Payment } from "./payments-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/currency"

interface CashExpensesClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultFilters: CashFiltersState
}

export function CashExpensesClient({ agencies, defaultFilters }: CashExpensesClientProps) {
  const [filters, setFilters] = useState(defaultFilters)
  const [totalExpenses, setTotalExpenses] = useState({ ars: 0, usd: 0 })

  const fetchTotalExpenses = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set("dateFrom", filters.dateFrom)
      params.set("dateTo", filters.dateTo)
      params.set("direction", "EXPENSE")
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

        setTotalExpenses({ ars, usd })
      }
    } catch (error) {
      console.error("Error fetching total expenses:", error)
    }
  }, [filters])

  useEffect(() => {
    fetchTotalExpenses()
  }, [fetchTotalExpenses])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Egresos</h1>
        <p className="text-muted-foreground">Todas las salidas del negocio (pagos a operadores, sueldos, etc.)</p>
      </div>

      <CashFilters agencies={agencies} value={filters} defaultValue={defaultFilters} onChange={setFilters} />

      {/* KPIs de totales */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border/40 p-5">
            <p className="text-xs font-medium text-muted-foreground">Total Egresos ARS</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{formatCurrency(totalExpenses.ars, "ARS")}</p>
        </div>
        <div className="rounded-xl border border-border/40 p-5">
            <p className="text-xs font-medium text-muted-foreground">Total Egresos USD</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{formatCurrency(totalExpenses.usd, "USD")}</p>
        </div>
      </div>

      <PaymentsTable
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        currency={filters.currency}
        agencyId={filters.agencyId}
        direction="EXPENSE"
        emptyMessage="No hay egresos en el rango seleccionado"
      />
    </div>
  )
}

