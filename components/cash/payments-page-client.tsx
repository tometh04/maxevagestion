"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CashFilters, CashFiltersState } from "./cash-filters"
import { PaymentsTable, Payment } from "./payments-table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"

interface PaymentsPageClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultFilters: CashFiltersState
}

export function PaymentsPageClient({ agencies, defaultFilters }: PaymentsPageClientProps) {
  const [baseFilters, setBaseFilters] = useState(defaultFilters)
  const [status, setStatus] = useState("ALL")
  const [payerType, setPayerType] = useState("ALL")
  const [direction, setDirection] = useState("ALL")
  const [refreshKey, setRefreshKey] = useState(0) // Para forzar refresh de PaymentsTable

  const filters = useMemo(
    () => ({
      ...baseFilters,
      status,
      payerType,
      direction,
    }),
    [baseFilters, status, payerType, direction],
  )

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1) // Forzar re-render de PaymentsTable
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pagos</h1>
        <p className="text-muted-foreground">Gestioná todos los pagos pendientes y registrados</p>
      </div>

      <CashFilters agencies={agencies} value={baseFilters} defaultValue={defaultFilters} onChange={setBaseFilters} />

      <div className="flex items-center gap-2 flex-wrap">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los estados</SelectItem>
              <SelectItem value="PENDING">Pendiente</SelectItem>
              <SelectItem value="OVERDUE">Vencido</SelectItem>
              <SelectItem value="PAID">Pagado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={payerType} onValueChange={setPayerType}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue placeholder="Tipo de pagador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="CUSTOMER">Clientes</SelectItem>
              <SelectItem value="OPERATOR">Operadores</SelectItem>
            </SelectContent>
          </Select>

          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue placeholder="Dirección" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="INCOME">Ingresos</SelectItem>
              <SelectItem value="EXPENSE">Egresos</SelectItem>
            </SelectContent>
          </Select>


          <Button variant="outline" size="sm" onClick={() => {
            setBaseFilters(defaultFilters)
            setStatus("ALL")
            setPayerType("ALL")
            setDirection("ALL")
          }} className="rounded-full">
            Limpiar filtros
          </Button>
      </div>

      <PaymentsTable
        key={refreshKey} // Forzar re-render cuando cambian los filtros
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        currency={filters.currency}
        agencyId={filters.agencyId}
        status={filters.status}
        payerType={filters.payerType}
        direction={filters.direction}
        onRefresh={handleRefresh}
        emptyMessage="No encontramos pagos con los filtros actuales"
      />
    </div>
  )
}
