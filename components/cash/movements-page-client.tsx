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

interface MovementsPageClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultFilters: CashFiltersState
  operations?: Array<{ id: string; destination: string }>
}

export function MovementsPageClient({ agencies, defaultFilters, operations = [] }: MovementsPageClientProps) {
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
      alert("No se pudo exportar el CSV. Intenta nuevamente.")
    }
  }, [filters])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Movimientos de Caja</h1>
          <p className="text-muted-foreground">Revisa todos los movimientos registrados en la caja</p>
        </div>
        <Button size="sm" className="h-8" onClick={() => setNewMovementDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Movimiento
        </Button>
      </div>

      <CashFilters agencies={agencies} value={baseFilters} defaultValue={defaultFilters} onChange={setBaseFilters} />

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
      </div>

      <MovementsTable
        key={refreshKey} // Forzar re-render cuando cambian los filtros
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        currency={filters.currency}
        agencyId={filters.agencyId}
        type={filters.type}
        emptyMessage="No encontramos movimientos con los filtros actuales"
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
