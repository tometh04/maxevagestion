"use client"

import { useEffect, useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { useDebounce } from "@/hooks/use-debounce"
import { DateTypeFilter, type DateTypeOption } from "@/components/ui/date-type-filter"
import { format, parseISO, isValid } from "date-fns"

// 2026-05-22 (VICO/Andrés): se reportó que el filtro decía "Operación"
// pero el backend filtraba por created_at (fecha de carga al sistema).
// Cuando se cargaba una venta retroactivamente, aparecía en el rango "hoy"
// en vez de en su fecha real. Ahora son 3 opciones explícitas:
//   - CARGA      → created_at (cuando se cargó la venta al sistema)
//   - OPERACION  → operation_date (cuándo se cerró la venta con el cliente)
//   - SALIDA     → departure_date (cuándo viaja el cliente)
// Default = CARGA para preservar números históricos (era el comportamiento
// implícito anterior). El user elige el otro tipo según qué corte quiere ver.
const dashboardDateTypes: DateTypeOption[] = [
  { value: "CARGA", label: "Fecha de Carga", shortLabel: "Carga" },
  { value: "OPERACION", label: "Fecha de Venta", shortLabel: "Venta" },
  { value: "SALIDA", label: "Fecha de Salida", shortLabel: "Salida" },
]

// Mapeo UI → columna SQL (whitelist en lib/analytics/date-filter.ts).
const DATE_TYPE_TO_FIELD: Record<string, string> = {
  CARGA: "created_at",
  OPERACION: "operation_date",
  SALIDA: "departure_date",
}

export interface DashboardFiltersState {
  dateFrom: string
  dateTo: string
  // dateType es el VALOR DEL DROPDOWN (CARGA/OPERACION/SALIDA).
  // Default vacío = legacy CARGA en el endpoint.
  dateType: string
  agencyId: string
  sellerId: string
}

/** Mapea el `dateType` del state al nombre de columna SQL. */
export function dateTypeToField(dateType: string | undefined): string {
  return DATE_TYPE_TO_FIELD[dateType || ""] || "created_at"
}

interface DashboardFiltersProps {
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  value: DashboardFiltersState
  defaultValue: DashboardFiltersState
  onChange: (filters: DashboardFiltersState) => void
}

function toDate(s: string): Date | undefined {
  if (!s) return undefined
  try {
    const d = parseISO(s)
    return isValid(d) ? d : undefined
  } catch { return undefined }
}

function toStr(d: Date | undefined): string {
  return d ? format(d, "yyyy-MM-dd") : ""
}

export function DashboardFilters({
  agencies,
  sellers,
  value,
  defaultValue,
  onChange,
}: DashboardFiltersProps) {
  const [filters, setFilters] = useState(value)

  useEffect(() => {
    setFilters(value)
  }, [value])

  const debouncedFilters = useDebounce(filters, 500)

  useEffect(() => {
    onChange(debouncedFilters)
  }, [debouncedFilters, onChange])

  const handleChange = (field: keyof DashboardFiltersState, newValue: string) => {
    setFilters((prev) => ({ ...prev, [field]: newValue }))
  }

  const handleReset = () => {
    setFilters(defaultValue)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DateTypeFilter
        types={dashboardDateTypes}
        includeNone={false}
        value={{
          type: filters.dateType || "CARGA",
          from: toDate(filters.dateFrom),
          to: toDate(filters.dateTo),
        }}
        onChange={(v) => {
          setFilters((prev) => ({
            ...prev,
            dateType: v.type || "CARGA",
            dateFrom: toStr(v.from),
            dateTo: toStr(v.to),
          }))
        }}
      />
      <Select value={filters.agencyId} onValueChange={(newValue) => handleChange("agencyId", newValue)}>
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
          <SelectValue placeholder="Agencia" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todas</SelectItem>
          {agencies.map((agency) => (
            <SelectItem key={agency.id} value={agency.id}>
              {agency.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.sellerId} onValueChange={(newValue) => handleChange("sellerId", newValue)}>
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
          <SelectValue placeholder="Vendedor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos</SelectItem>
          {sellers.map((seller) => (
            <SelectItem key={seller.id} value={seller.id}>
              {seller.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={handleReset}>
        <X className="mr-1 h-3.5 w-3.5" /> Limpiar
      </Button>
    </div>
  )
}
