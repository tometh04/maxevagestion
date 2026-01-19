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

  useEffect(() => {
    onChange(filters)
  }, [filters, onChange])

  const handleChange = (field: keyof AlertsFiltersState, newValue: string) => {
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
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select value={filters.type} onValueChange={(newValue) => handleChange("type", newValue)}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Estado</Label>
          <Select value={filters.status} onValueChange={(newValue) => handleChange("status", newValue)}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
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

        <div className="space-y-1.5">
          <Label className="text-xs">Agencia</Label>
          <Select value={filters.agencyId} onValueChange={(newValue) => handleChange("agencyId", newValue)}>
            <SelectTrigger>
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
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={handleReset}>
          Reiniciar filtros
        </Button>
      </div>
    </div>
  )
}

