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
    <div className="space-y-4 rounded-lg border p-4">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-6 items-end">
        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
          <Label className="text-xs">Agencia</Label>
          <Select value={agencyId} onValueChange={setAgencyId}>
            <SelectTrigger>
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
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
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
        <div className="space-y-1.5">
          <Label className="text-xs">Moneda</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              <SelectItem value="ARS">ARS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={handleApply} className="w-full sm:w-auto">Aplicar Filtros</Button>
        <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto">
          Reiniciar
        </Button>
      </div>
    </div>
  )
}

