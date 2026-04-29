"use client"

import { useCallback, useEffect, useState } from "react"
import { CashFilters, CashFiltersState } from "./cash-filters"
import { PaymentsTable, Payment } from "./payments-table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { formatCurrency } from "@/lib/currency"
import { useDebounce } from "@/hooks/use-debounce"
import type { DateTypeOption } from "@/components/ui/date-type-filter"

const expensesDateTypes: DateTypeOption[] = [
  { value: "CREACION", label: "Creación", shortLabel: "Creac." },
  { value: "PAGO", label: "Pago", shortLabel: "Pago" },
  { value: "OPERACION", label: "Operación", shortLabel: "Op." },
]

interface CashExpensesClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultFilters: CashFiltersState
}

export function CashExpensesClient({ agencies, defaultFilters }: CashExpensesClientProps) {
  const [filters, setFilters] = useState(defaultFilters)
  const [contactNameInput, setContactNameInput] = useState("")
  const contactName = useDebounce(contactNameInput, 400)
  const [totalExpenses, setTotalExpenses] = useState({ ars: 0, usd: 0 })

  const fetchTotalExpenses = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      params.set("dateFrom", filters.dateFrom)
      params.set("dateTo", filters.dateTo)
      if (filters.dateType) params.set("dateType", filters.dateType)
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

      <CashFilters agencies={agencies} value={filters} defaultValue={defaultFilters} onChange={setFilters} dateTypes={expensesDateTypes} />

      {/* Búsqueda por nombre de cliente/operador */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar por cliente u operador..."
          value={contactNameInput}
          onChange={(e) => setContactNameInput(e.target.value)}
          className="pl-9"
        />
      </div>

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
        dateType={filters.dateType}
        currency={filters.currency}
        agencyId={filters.agencyId}
        direction="EXPENSE"
        contactName={contactName}
        emptyMessage="No hay egresos en el rango seleccionado"
      />
    </div>
  )
}

