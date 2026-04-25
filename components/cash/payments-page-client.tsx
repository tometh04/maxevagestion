"use client"

import { useCallback, useMemo, useState } from "react"
import { CashFilters, CashFiltersState } from "./cash-filters"
import { PaymentsTable, Payment } from "./payments-table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, X, Plus } from "lucide-react"
import { NewPaymentDialog } from "@/components/payments/new-payment-dialog"
import type { DateTypeOption } from "@/components/ui/date-type-filter"

const paymentsDateTypes: DateTypeOption[] = [
  { value: "CREACION", label: "Creación", shortLabel: "Creac." },
  { value: "PAGO", label: "Pago", shortLabel: "Pago" },
  { value: "VENCIMIENTO", label: "Vencimiento", shortLabel: "Venc." },
  { value: "OPERACION", label: "Operación", shortLabel: "Op." },
]

interface PaymentsPageClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultFilters: CashFiltersState
}

export function PaymentsPageClient({ agencies, defaultFilters }: PaymentsPageClientProps) {
  const [baseFilters, setBaseFilters] = useState(defaultFilters)
  const [status, setStatus] = useState("ALL")
  const [payerType, setPayerType] = useState("ALL")
  const [direction, setDirection] = useState("EXPENSE")
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const [newPaymentOpen, setNewPaymentOpen] = useState(false)

  const filters = useMemo(
    () => ({
      ...baseFilters,
      status,
      payerType,
      direction,
      contactName: searchQuery,
    }),
    [baseFilters, status, payerType, direction, searchQuery],
  )

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1)
  }, [])

  const handleSearch = () => {
    setSearchQuery(searchInput)
  }

  const hasActiveFilters =
    status !== "ALL" || payerType !== "ALL" || direction !== "EXPENSE" || searchQuery !== ""

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por destino, cliente..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch()
            }}
            className="pl-9 h-8 text-xs rounded-full"
          />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
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
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los tipos</SelectItem>
            <SelectItem value="CUSTOMER">Clientes</SelectItem>
            <SelectItem value="OPERATOR">Operadores</SelectItem>
          </SelectContent>
        </Select>

        <Select value={direction} onValueChange={setDirection}>
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
            <SelectValue placeholder="Dirección" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Ingresos y egresos</SelectItem>
            <SelectItem value="INCOME">Ingresos</SelectItem>
            <SelectItem value="EXPENSE">Egresos</SelectItem>
          </SelectContent>
        </Select>

        <CashFilters agencies={agencies} value={baseFilters} defaultValue={defaultFilters} onChange={setBaseFilters} dateTypes={paymentsDateTypes} />

        <Button
          size="sm"
          onClick={() => setNewPaymentOpen(true)}
          className="h-8 rounded-full text-xs"
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Nuevo Pago
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => {
            setBaseFilters(defaultFilters)
            setStatus("ALL")
            setPayerType("ALL")
            setDirection("EXPENSE")
            setSearchInput("")
            setSearchQuery("")
          }} className="h-8 rounded-full text-xs">
            <X className="mr-1 h-3.5 w-3.5" /> Limpiar
          </Button>
        )}
      </div>

      <NewPaymentDialog
        open={newPaymentOpen}
        onOpenChange={setNewPaymentOpen}
        onSuccess={handleRefresh}
      />

      <PaymentsTable
        key={refreshKey}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        dateType={filters.dateType}
        currency={filters.currency}
        agencyId={filters.agencyId}
        status={filters.status}
        payerType={filters.payerType}
        direction={filters.direction}
        contactName={filters.contactName}
        onRefresh={handleRefresh}
        emptyMessage="No encontramos pagos con los filtros actuales"
      />
    </div>
  )
}
