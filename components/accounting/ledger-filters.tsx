"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X } from "lucide-react"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { format } from "date-fns"

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

  const formatDateString = (date: Date | undefined): string | undefined => {
    return date ? format(date, "yyyy-MM-dd") : undefined
  }

  const handleApply = () => {
    onFiltersChange({
      dateFrom: formatDateString(dateFrom),
      dateTo: formatDateString(dateTo),
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
    <div className="flex items-center gap-2 flex-wrap">
      <DateInputWithCalendar
        value={dateFrom}
        onChange={(date) => {
          setDateFrom(date)
          if (date && dateTo && dateTo < date) {
            setDateTo(undefined)
          }
        }}
        placeholder="Desde"
        className="h-8 text-xs rounded-full"
      />

      <DateInputWithCalendar
        value={dateTo}
        onChange={(date) => {
          if (date && dateFrom && date < dateFrom) {
            return
          }
          setDateTo(date)
        }}
        placeholder="Hasta"
        minDate={dateFrom}
        className="h-8 text-xs rounded-full"
      />

      <Select value={agencyId} onValueChange={setAgencyId}>
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

      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
          <SelectValue placeholder="Tipo" />
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

      <Select value={currency} onValueChange={setCurrency}>
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[120px] w-auto">
          <SelectValue placeholder="Moneda" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todas</SelectItem>
          <SelectItem value="ARS">ARS</SelectItem>
          <SelectItem value="USD">USD</SelectItem>
        </SelectContent>
      </Select>

      <Button size="sm" className="h-8 rounded-full text-xs" onClick={handleApply}>Aplicar</Button>
      <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={handleReset}>
        <X className="mr-1 h-3.5 w-3.5" /> Limpiar
      </Button>
    </div>
  )
}
