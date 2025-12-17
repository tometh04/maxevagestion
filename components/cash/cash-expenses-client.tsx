"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CashFilters, CashFiltersState } from "./cash-filters"
import { MovementsTable } from "./movements-table"
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
      params.set("type", "EXPENSE")
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

        setTotalExpenses({ ars, usd })
      }
    } catch (error) {
      console.error("Error fetching total expenses:", error)
    }
  }, [filters])

  useEffect(() => {
    fetchTotalExpenses()
  }, [fetchTotalExpenses])

  const filtersWithType = useMemo(
    () => ({
      ...filters,
      type: "EXPENSE" as const,
    }),
    [filters]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Egresos</h1>
          <p className="text-muted-foreground">Todas las salidas del negocio (pagos a operadores, sueldos, etc.)</p>
        </div>
        <button
          onClick={async () => {
            if (confirm("¿Sincronizar pagos pagados con movimientos de caja? Esto creará movimientos para todos los pagos que no tienen movimiento asociado.")) {
              try {
                const response = await fetch("/api/cash/sync-movements", { method: "POST" })
                const data = await response.json()
                if (response.ok) {
                  alert(`✅ ${data.message}\nCreados: ${data.created}\nErrores: ${data.errors}`)
                  fetchTotalExpenses() // Recargar totales
                } else {
                  alert(`❌ Error: ${data.error}`)
                }
              } catch (error) {
                alert("❌ Error al sincronizar")
              }
            }
          }}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
        >
          Sincronizar Movimientos
        </button>
      </div>

      <CashFilters agencies={agencies} value={filters} defaultValue={defaultFilters} onChange={setFilters} />

      {/* KPIs de totales */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Egresos ARS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalExpenses.ars, "ARS")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Egresos USD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalExpenses.usd, "USD")}</div>
          </CardContent>
        </Card>
      </div>

      <MovementsTable
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        currency={filters.currency}
        agencyId={filters.agencyId}
        type="EXPENSE"
        emptyMessage="No hay egresos en el rango seleccionado"
      />
    </div>
  )
}

