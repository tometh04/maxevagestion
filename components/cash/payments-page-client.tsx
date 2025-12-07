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
        <h1 className="text-3xl font-bold">Pagos</h1>
        <p className="text-muted-foreground">Gestioná todos los pagos pendientes y registrados</p>
      </div>

      <CashFilters agencies={agencies} value={baseFilters} defaultValue={defaultFilters} onChange={setBaseFilters} />

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
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
            <SelectTrigger>
              <SelectValue placeholder="Tipo de pagador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="CUSTOMER">Clientes</SelectItem>
              <SelectItem value="OPERATOR">Operadores</SelectItem>
            </SelectContent>
          </Select>

          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger>
              <SelectValue placeholder="Dirección" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="INCOME">Ingresos</SelectItem>
              <SelectItem value="EXPENSE">Egresos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 flex justify-end space-x-2">
          <Button variant="outline" onClick={() => {
            setBaseFilters(defaultFilters)
            setStatus("ALL")
            setPayerType("ALL")
            setDirection("ALL")
          }}>
            Limpiar filtros
          </Button>
        </div>
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
