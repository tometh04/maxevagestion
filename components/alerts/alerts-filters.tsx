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
import { DateRangePicker } from "@/components/ui/date-range-picker"

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

  const handleReset = () => {
    setFilters(defaultValue)
  }

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>Tipo</Label>
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

        <div className="space-y-2">
          <Label>Estado</Label>
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

        <div className="space-y-2">
          <Label>Rango de fechas</Label>
          <DateRangePicker
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            onChange={(dateFrom, dateTo) => {
              setFilters((prev) => ({ ...prev, dateFrom, dateTo }))
            }}
            placeholder="Seleccionar rango"
          />
        </div>

        <div className="space-y-2">
          <Label>Agencia</Label>
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

