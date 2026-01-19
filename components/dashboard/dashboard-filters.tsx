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

  useEffect(() => {
    onChange(filters)
  }, [filters, onChange])

  const handleChange = (field: keyof DashboardFiltersState, newValue: string) => {
    setFilters((prev) => ({ ...prev, [field]: newValue }))
  }

  const handleReset = () => {
    setFilters(defaultValue)
  }

  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm sm:p-4">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Rango de fechas</Label>
          <div className="flex items-center gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Desde</Label>
              <DateInputWithCalendar
                value={parseDate(filters.dateFrom)}
                onChange={(date) => {
                  setFilters((prev) => ({ ...prev, dateFrom: date ? format(date, "yyyy-MM-dd") : "" }))
                }}
                placeholder="dd/MM/yyyy"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Hasta</Label>
              <DateInputWithCalendar
                value={parseDate(filters.dateTo)}
                onChange={(date) => {
                  setFilters((prev) => ({ ...prev, dateTo: date ? format(date, "yyyy-MM-dd") : "" }))
                }}
                placeholder="dd/MM/yyyy"
                minDate={parseDate(filters.dateFrom)}
              />
            </div>
          </div>
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
        <div className="space-y-2">
          <Label>Vendedor</Label>
          <Select value={filters.sellerId} onValueChange={(newValue) => handleChange("sellerId", newValue)}>
            <SelectTrigger>
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
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={handleReset}>
          Reiniciar filtros
        </Button>
      </div>
    </div>
  )
}

