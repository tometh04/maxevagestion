"use client"

import { useEffect, useState } from "react"
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
import { useDebounce } from "@/hooks/use-debounce"

export interface AlertsFiltersState {
  type: string
  status: string
  dateFrom: string
  dateTo: string
  agencyId: string
}

interface AlertsFiltersProps {
  agencies: Array<{ id: string; name: string }>
  value: AlertsFiltersState
  defaultValue: AlertsFiltersState
  onChange: (filters: AlertsFiltersState) => void
}

const typeOptions = [
  { value: "ALL", label: "Todos los tipos" },
  { value: "PAYMENT_DUE", label: "Pago Pendiente" },
  { value: "OPERATOR_DUE", label: "Pago Operador" },
  { value: "UPCOMING_TRIP", label: "Viaje Próximo" },
  { value: "MISSING_DOC", label: "Documento Faltante" },
  { value: "GENERIC", label: "Genérico" },
  { value: "TASK_REMINDER", label: "Recordatorio de Tarea" },
]

const statusOptions = [
  { value: "ALL", label: "Todos los estados" },
  { value: "PENDING", label: "Pendiente" },
  { value: "DONE", label: "Resuelto" },
  { value: "IGNORED", label: "Ignorado" },
]

export function AlertsFilters({ agencies, value, defaultValue, onChange }: AlertsFiltersProps) {
  const [filters, setFilters] = useState(value)

  useEffect(() => {
    setFilters(value)
  }, [value])

  // Debounce para todos los cambios de filtros (500ms - balance entre responsividad y estabilidad)
  const debouncedFilters = useDebounce(filters, 500)

  useEffect(() => {
    onChange(debouncedFilters)
  }, [debouncedFilters, onChange])

  const handleChange = (field: keyof AlertsFiltersState, newValue: string) => {
    setFilters((prev) => ({ ...prev, [field]: newValue }))
  }

  const handleReset = () => {
    setFilters(defaultValue)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={filters.type} onValueChange={(newValue) => handleChange("type", newValue)}>
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          {typeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.status} onValueChange={(newValue) => handleChange("status", newValue)}>
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
      <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={handleReset}>
        <X className="mr-1 h-3.5 w-3.5" /> Limpiar
      </Button>
    </div>
  )
}
