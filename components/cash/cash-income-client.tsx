"use client"

import { useCallback, useEffect, useState } from "react"
import { CashFilters, CashFiltersState } from "./cash-filters"
import { PaymentsTable, Payment } from "./payments-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { formatCurrency } from "@/lib/currency"
import { useDebounce } from "@/hooks/use-debounce"

interface CashIncomeClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultFilters: CashFiltersState
}

export function CashIncomeClient({ agencies, defaultFilters }: CashIncomeClientProps) {
  const [filters, setFilters] = useState(defaultFilters)
  const [contactNameInput, setContactNameInput] = useState("")
  const contactName = useDebounce(contactNameInput, 400)
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

      {/* Búsqueda por nombre de cliente */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar por cliente..."
          value={contactNameInput}
          onChange={(e) => setContactNameInput(e.target.value)}
          className="pl-9"
        />
      </div>

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
        contactName={contactName}
        emptyMessage="No hay ingresos en el rango seleccionado"
      />
    </div>
  )
}

