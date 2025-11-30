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
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarIcon, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

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
  const [dateFromOpen, setDateFromOpen] = useState(false)
  const [dateToOpen, setDateToOpen] = useState(false)

  const handleFilterChange = (key: keyof ReportsFiltersState, value: string) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const handleDateChange = (key: "dateFrom" | "dateTo", date: Date | undefined) => {
    if (date) {
      const dateString = format(date, "yyyy-MM-dd")
      handleFilterChange(key, dateString)
    }
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
            <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !filters.dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateFrom ? (
                    format(new Date(filters.dateFrom), "dd/MM/yyyy", { locale: es })
                  ) : (
                    <span className="text-xs sm:text-sm">Seleccionar fecha</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                  onSelect={(date) => {
                    handleDateChange("dateFrom", date)
                    setDateFromOpen(false)
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Date To */}
          <div className="space-y-2">
            <Label htmlFor="dateTo" className="text-xs sm:text-sm">
              Hasta
            </Label>
            <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !filters.dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.dateTo ? (
                    format(new Date(filters.dateTo), "dd/MM/yyyy", { locale: es })
                  ) : (
                    <span className="text-xs sm:text-sm">Seleccionar fecha</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
                  onSelect={(date) => {
                    handleDateChange("dateTo", date)
                    setDateToOpen(false)
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
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

