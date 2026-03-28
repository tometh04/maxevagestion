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
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { format, parseISO, isValid } from "date-fns"

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

export function AlertsFilters({ agencies, value, defaultValue, onChange }: AlertsFiltersProps) {
  const [filters, setFilters] = useState(value)

  useEffect(() => {
    setFilters(value)
  }, [value])

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
      <DateInputWithCalendar
        value={toDate(filters.dateFrom)}
        onChange={(date) => {
          const str = toStr(date)
          setFilters((prev) => ({
            ...prev,
            dateFrom: str,
            dateTo: str && prev.dateTo && prev.dateTo < str ? "" : prev.dateTo,
          }))
        }}
        placeholder="Desde"
        className="h-8 text-xs rounded-full"
      />
      <DateInputWithCalendar
        value={toDate(filters.dateTo)}
        onChange={(date) => {
          const str = toStr(date)
          if (str && filters.dateFrom && str < filters.dateFrom) return
          setFilters((prev) => ({ ...prev, dateTo: str }))
        }}
        placeholder="Hasta"
        minDate={toDate(filters.dateFrom)}
        className="h-8 text-xs rounded-full"
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
