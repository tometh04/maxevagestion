"use client"

import { useEffect, useState } from "react"
import { useDebounce } from "@/hooks/use-debounce"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

export interface CashFiltersState {
  dateFrom: string
  dateTo: string
  agencyId: string
  currency: string
}

interface CashFiltersProps {
  agencies: Array<{ id: string; name: string }>
  value: CashFiltersState
  defaultValue: CashFiltersState
  onChange: (filters: CashFiltersState) => void
}

const currencyOptions = [
  { value: "ARS", label: "ARS" },
  { value: "USD", label: "USD" },
  { value: "ALL", label: "Todas" },
]

export function CashFilters({ agencies, value, defaultValue, onChange }: CashFiltersProps) {
  const [filters, setFilters] = useState(value)

  useEffect(() => {
    setFilters(value)
  }, [value])

  // Debounce para todos los cambios de filtros (500ms - balance entre responsividad y estabilidad)
  const debouncedFilters = useDebounce(filters, 500)

  useEffect(() => {
    onChange(debouncedFilters)
  }, [debouncedFilters, onChange])

  const handleChange = (field: keyof CashFiltersState, newValue: string) => {
    setFilters((prev) => ({ ...prev, [field]: newValue }))
  }

  const handleReset = () => {
    setFilters(defaultValue)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Input
        type="date"
        value={filters.dateFrom}
        onChange={(e) => {
          const dateString = e.target.value
          setFilters((prev) => ({
            ...prev,
            dateFrom: dateString,
            dateTo: dateString && prev.dateTo && prev.dateTo < dateString ? "" : prev.dateTo
          }))
        }}
        className="h-8 text-xs rounded-full border-border/60 bg-background w-[150px]"
        placeholder="Desde"
      />
      <Input
        type="date"
        value={filters.dateTo}
        onChange={(e) => {
          const dateString = e.target.value
          if (dateString && filters.dateFrom && dateString < filters.dateFrom) {
            return
          }
          setFilters((prev) => ({ ...prev, dateTo: dateString }))
        }}
        min={filters.dateFrom || undefined}
        className="h-8 text-xs rounded-full border-border/60 bg-background w-[150px]"
        placeholder="Hasta"
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
      <Select value={filters.currency} onValueChange={(newValue) => handleChange("currency", newValue)}>
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[120px] w-auto">
          <SelectValue placeholder="Moneda" />
        </SelectTrigger>
        <SelectContent>
          {currencyOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
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
