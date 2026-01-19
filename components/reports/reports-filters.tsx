"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { format, parseISO } from "date-fns"
import { RotateCcw } from "lucide-react"

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

export function ReportsFilters({
  agencies,
  sellers,
  defaultFilters,
  onFiltersChange,
  onReset,
}: ReportsFiltersProps) {
  const [filters, setFilters] = useState<ReportsFiltersState>(defaultFilters)

  const handleFilterChange = (key: keyof ReportsFiltersState, value: string) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFiltersChange(newFilters)
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

  const handleDateFromChange = (date: Date | undefined) => {
    const dateString = formatDate(date)
    setFilters((prev) => ({ 
      ...prev, 
      dateFrom: dateString,
      dateTo: date && parseDate(prev.dateTo) && parseDate(prev.dateTo)! < date ? "" : prev.dateTo
    }))
    handleFilterChange("dateFrom", dateString)
    if (date && parseDate(filters.dateTo) && parseDate(filters.dateTo)! < date) {
      handleFilterChange("dateTo", "")
    }
  }

  const handleDateToChange = (date: Date | undefined) => {
    if (date && parseDate(filters.dateFrom) && date < parseDate(filters.dateFrom)!) {
      return
    }
    const dateString = formatDate(date)
    setFilters((prev) => ({ ...prev, dateTo: dateString }))
    handleFilterChange("dateTo", dateString)
  }

  const handleReset = () => {
    setFilters(defaultFilters)
    onReset()
  }

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* Date From */}
          <div className="space-y-2">
            <Label htmlFor="dateFrom" className="text-xs sm:text-sm">
              Desde
            </Label>
            <DateInputWithCalendar
              value={parseDate(filters.dateFrom)}
              onChange={handleDateFromChange}
              placeholder="dd/MM/yyyy"
            />
          </div>

          {/* Date To */}
          <div className="space-y-2">
            <Label htmlFor="dateTo" className="text-xs sm:text-sm">
              Hasta
            </Label>
            <DateInputWithCalendar
              value={parseDate(filters.dateTo)}
              onChange={handleDateToChange}
              placeholder="dd/MM/yyyy"
              minDate={parseDate(filters.dateFrom)}
            />
          </div>

          {/* Agency */}
          <div className="space-y-2">
            <Label htmlFor="agencyId" className="text-xs sm:text-sm">
              Agencia
            </Label>
            <Select value={filters.agencyId} onValueChange={(value) => handleFilterChange("agencyId", value)}>
              <SelectTrigger className="w-full">
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

          {/* Seller */}
          <div className="space-y-2">
            <Label htmlFor="sellerId" className="text-xs sm:text-sm">
              Vendedor
            </Label>
            <Select value={filters.sellerId} onValueChange={(value) => handleFilterChange("sellerId", value)}>
              <SelectTrigger className="w-full">
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

          {/* Reset Button */}
          <div className="flex items-end">
            <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto">
              <RotateCcw className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Reiniciar</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

