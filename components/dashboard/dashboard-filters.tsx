"use client"

import { useEffect, useState } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { format, parseISO } from "date-fns"
import { useDebounce } from "@/hooks/use-debounce"

export interface DashboardFiltersState {
  dateFrom: string
  dateTo: string
  agencyId: string
  sellerId: string
}

// Helper para convertir string a Date
const parseDate = (dateString: string): Date | undefined => {
  if (!dateString) return undefined
  try {
    return parseISO(dateString)
  } catch {
    return undefined
  }
}

interface DashboardFiltersProps {
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  value: DashboardFiltersState
  defaultValue: DashboardFiltersState
  onChange: (filters: DashboardFiltersState) => void
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

  // Debounce para todos los cambios de filtros (500ms - balance entre responsividad y estabilidad)
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
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Desde</Label>
        <DateInputWithCalendar
          value={parseDate(filters.dateFrom)}
          onChange={(date) => {
            setFilters((prev) => ({ ...prev, dateFrom: date ? format(date, "yyyy-MM-dd") : "" }))
          }}
          placeholder="dd/MM/yyyy"
          className="h-8 text-xs"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Hasta</Label>
        <DateInputWithCalendar
          value={parseDate(filters.dateTo)}
          onChange={(date) => {
            setFilters((prev) => ({ ...prev, dateTo: date ? format(date, "yyyy-MM-dd") : "" }))
          }}
          placeholder="dd/MM/yyyy"
          minDate={parseDate(filters.dateFrom)}
          className="h-8 text-xs"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Agencia</Label>
        <Select value={filters.agencyId} onValueChange={(newValue) => handleChange("agencyId", newValue)}>
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
            <SelectValue placeholder="Todas" />
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
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Vendedor</Label>
        <Select value={filters.sellerId} onValueChange={(newValue) => handleChange("sellerId", newValue)}>
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
            <SelectValue placeholder="Todos" />
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
      </div>

      <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs text-muted-foreground">
        Reiniciar filtros
      </Button>
    </div>
  )
}

