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

const dashboardDateTypes: DateTypeOption[] = [
  { value: "OPERACION", label: "Operación", shortLabel: "Op." },
]

export interface DashboardFiltersState {
  dateFrom: string
  dateTo: string
  agencyId: string
  sellerId: string
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
        value={{ type: "OPERACION", from: toDate(filters.dateFrom), to: toDate(filters.dateTo) }}
        onChange={(v) => {
          setFilters((prev) => ({
            ...prev,
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
