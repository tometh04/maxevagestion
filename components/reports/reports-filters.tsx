"use client"

import { useState, useEffect } from "react"
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

const reportsDateTypes: DateTypeOption[] = [
  { value: "OPERACION", label: "Operación", shortLabel: "Op." },
]

export interface ReportsFiltersState {
  dateFrom: string
  dateTo: string
  agencyId: string
  sellerId: string
  reportType: string
}

interface ReportsFiltersProps {
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  defaultFilters: ReportsFiltersState
  onFiltersChange: (filters: ReportsFiltersState) => void
  onReset: () => void
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

export function ReportsFilters({
  agencies,
  sellers,
  defaultFilters,
  onFiltersChange,
  onReset,
}: ReportsFiltersProps) {
  const [filters, setFilters] = useState<ReportsFiltersState>(defaultFilters)

  const debouncedFilters = useDebounce(filters, 500)

  useEffect(() => {
    onFiltersChange(debouncedFilters)
  }, [debouncedFilters, onFiltersChange])

  const handleFilterChange = (key: keyof ReportsFiltersState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleReset = () => {
    setFilters(defaultFilters)
    onReset()
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DateTypeFilter
        types={reportsDateTypes}
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
      <Select value={filters.agencyId} onValueChange={(value) => handleFilterChange("agencyId", value)}>
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
      <Select value={filters.sellerId} onValueChange={(value) => handleFilterChange("sellerId", value)}>
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
