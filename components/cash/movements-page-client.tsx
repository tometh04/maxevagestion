"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CashFilters, CashFiltersState } from "./cash-filters"
import { MovementsTable, CashMovement } from "./movements-table"
import { NewCashMovementDialog } from "./new-cash-movement-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import type { DateTypeOption } from "@/components/ui/date-type-filter"

const movementsDateTypes: DateTypeOption[] = [
  { value: "MOVIMIENTO", label: "Movimiento", shortLabel: "Mov." },
  { value: "OPERACION", label: "Operación", shortLabel: "Op." },
]

interface MovementsPageClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultFilters: CashFiltersState
  operations?: Array<{ id: string; destination: string }>
  userRole?: string
}

export function MovementsPageClient({ agencies, defaultFilters, operations = [], userRole }: MovementsPageClientProps) {
  const [baseFilters, setBaseFilters] = useState(defaultFilters)
  const [type, setType] = useState("ALL")
  const [newMovementDialogOpen, setNewMovementDialogOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0) // Para forzar refresh de MovementsTable

  const filters = useMemo(
    () => ({
      ...baseFilters,
      type,
    }),
    [baseFilters, type],
  )

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1) // Forzar re-render de MovementsTable
  }, [])

  const handleExport = useCallback(async () => {
    const params = new URLSearchParams()
    params.set("dateFrom", filters.dateFrom)
    params.set("dateTo", filters.dateTo)
    params.set("currency", filters.currency)
    if (filters.dateType) {
      params.set("dateType", filters.dateType)
    }

    if (filters.agencyId !== "ALL") {
      params.set("agencyId", filters.agencyId)
    }

    if (filters.type !== "ALL") {
      params.set("type", filters.type)
    }

    try {
      const response = await fetch(`/api/cash/export?${params.toString()}`)

      if (!response.ok) {
        throw new Error("No se pudo exportar")
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `cash-movements-${Date.now()}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error al exportar movimientos:", error)
      toast.error("No se pudo exportar el CSV. Intenta nuevamente.")
    }
  }, [filters])

  return (
    <div className="space-y-6">
      <CashFilters agencies={agencies} value={baseFilters} defaultValue={defaultFilters} onChange={setBaseFilters} dateTypes={movementsDateTypes} />

      <div className="flex items-center gap-3 flex-wrap">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[160px]">
              <SelectValue placeholder="Tipo de movimiento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="INCOME">Ingresos</SelectItem>
              <SelectItem value="EXPENSE">Egresos</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={() => {
            setBaseFilters(defaultFilters)
            setType("ALL")
          }}>
            Limpiar filtros
          </Button>
          <Button size="sm" className="h-8 rounded-full" onClick={handleExport}>Exportar CSV</Button>
          <Button size="sm" className="h-8 rounded-full" onClick={() => setNewMovementDialogOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Nuevo
          </Button>
      </div>

      <MovementsTable
        key={refreshKey} // Forzar re-render cuando cambian los filtros
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        dateType={filters.dateType}
        currency={filters.currency}
        agencyId={filters.agencyId}
        type={filters.type}
        customerQuery={filters.customerQuery}
        emptyMessage="No encontramos movimientos con los filtros actuales"
        userRole={userRole}
      />

      <NewCashMovementDialog
        open={newMovementDialogOpen}
        onOpenChange={setNewMovementDialogOpen}
        onSuccess={handleRefresh}
        operations={operations}
      />
    </div>
  )
}
