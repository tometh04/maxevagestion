"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { format, parseISO } from "date-fns"

interface LedgerFiltersProps {
  agencies: Array<{ id: string; name: string }>
  onFiltersChange: (filters: {
    dateFrom?: string
    dateTo?: string
    type?: string
    currency?: string
    agencyId?: string
  }) => void
}

export function LedgerFilters({ agencies, onFiltersChange }: LedgerFiltersProps) {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [type, setType] = useState("ALL")
  const [currency, setCurrency] = useState("ALL")
  const [agencyId, setAgencyId] = useState("ALL")

  const handleApply = () => {
    onFiltersChange({
      dateFrom: dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined,
      dateTo: dateTo ? format(dateTo, "yyyy-MM-dd") : undefined,
      type: type !== "ALL" ? type : undefined,
      currency: currency !== "ALL" ? currency : undefined,
      agencyId: agencyId !== "ALL" ? agencyId : undefined,
    })
  }

  const handleReset = () => {
    setDateFrom(undefined)
    setDateTo(undefined)
    setType("ALL")
    setCurrency("ALL")
    setAgencyId("ALL")
    onFiltersChange({})
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">Desde</Label>
          <DateInputWithCalendar
            value={dateFrom}
            onChange={(date) => {
              setDateFrom(date)
              if (date && dateTo && dateTo < date) {
                setDateTo(undefined)
              }
            }}
            placeholder="dd/MM/yyyy"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta</Label>
          <DateInputWithCalendar
            value={dateTo}
            onChange={(date) => {
              if (date && dateFrom && date < dateFrom) {
                return
              }
              setDateTo(date)
            }}
            placeholder="dd/MM/yyyy"
            minDate={dateFrom}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Agencia</Label>
          <Select value={agencyId} onValueChange={setAgencyId}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue />
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
          <Label className="text-xs">Tipo</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="INCOME">Ingreso</SelectItem>
              <SelectItem value="EXPENSE">Gasto</SelectItem>
              <SelectItem value="FX_GAIN">Ganancia FX</SelectItem>
              <SelectItem value="FX_LOSS">Pérdida FX</SelectItem>
              <SelectItem value="COMMISSION">Comisión</SelectItem>
              <SelectItem value="OPERATOR_PAYMENT">Pago Operador</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Moneda</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              <SelectItem value="ARS">ARS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pt-4">
          <Button size="sm" className="h-8 rounded-full" onClick={handleApply}>Aplicar Filtros</Button>
          <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={handleReset}>
            Reiniciar
          </Button>
        </div>
      </div>
    </div>
  )
}

