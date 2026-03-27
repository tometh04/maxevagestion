"use client"

import { useEffect, useState } from "react"
import { useDebounce } from "@/hooks/use-debounce"
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
  
  // Helper para convertir string a Date
  const parseDate = (dateString: string): Date | undefined => {
    if (!dateString) return undefined
    try {
      return parseISO(dateString)
    } catch {
      return undefined
    }
  }
  
  // Helper para convertir Date a string
  const formatDate = (date: Date | undefined): string => {
    return date ? format(date, "yyyy-MM-dd") : ""
  }

  const handleReset = () => {
    setFilters(defaultValue)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">Desde</Label>
          <DateInputWithCalendar
            value={parseDate(filters.dateFrom)}
            onChange={(date) => {
              const dateString = formatDate(date)
              setFilters((prev) => ({ 
                ...prev, 
                dateFrom: dateString,
                dateTo: date && parseDate(prev.dateTo) && parseDate(prev.dateTo)! < date ? "" : prev.dateTo
              }))
            }}
            placeholder="dd/MM/yyyy"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta</Label>
          <DateInputWithCalendar
            value={parseDate(filters.dateTo)}
            onChange={(date) => {
              if (date && parseDate(filters.dateFrom) && date < parseDate(filters.dateFrom)!) {
                return
              }
              setFilters((prev) => ({ ...prev, dateTo: formatDate(date) }))
            }}
            placeholder="dd/MM/yyyy"
            minDate={parseDate(filters.dateFrom)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Agencia</Label>
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
        <div className="space-y-1">
          <Label className="text-xs">Moneda</Label>
          <Select value={filters.currency} onValueChange={(newValue) => handleChange("currency", newValue)}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {currencyOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button variant="outline" size="sm" className="rounded-full" onClick={handleReset}>
            Reiniciar filtros
          </Button>
        </div>
    </div>
  )
}
