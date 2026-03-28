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
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { format, parseISO } from "date-fns"

export interface CashFiltersState {
  dateFrom: string
  dateTo: string
  agencyId: string
  currency: string
}

interface CashFiltersProps {
  agencies: Array<{ id: string; name: string }>
  value: CashFiltersState
  defaultValue: CashFiltersState
  onChange: (filters: CashFiltersState) => void
}

const currencyOptions = [
  { value: "ARS", label: "ARS" },
  { value: "USD", label: "USD" },
  { value: "ALL", label: "Todas" },
]

export function CashFilters({ agencies, value, defaultValue, onChange }: CashFiltersProps) {
  const [agencyId, setAgencyId] = useState(value.agencyId)
  const [currency, setCurrency] = useState(value.currency)
  const [dateFrom, setDateFrom] = useState<Date | undefined>(
    value.dateFrom ? parseISO(value.dateFrom) : undefined
  )
  const [dateTo, setDateTo] = useState<Date | undefined>(
    value.dateTo ? parseISO(value.dateTo) : undefined
  )

  // Sync external value changes
  useEffect(() => {
    setAgencyId(value.agencyId)
    setCurrency(value.currency)
    setDateFrom(value.dateFrom ? parseISO(value.dateFrom) : undefined)
    setDateTo(value.dateTo ? parseISO(value.dateTo) : undefined)
  }, [value])

  const formatDateString = (date: Date | undefined): string => {
    return date ? format(date, "yyyy-MM-dd") : ""
  }

  // Notify parent on any change
  const emitChange = (updates: Partial<{ dateFrom: Date | undefined; dateTo: Date | undefined; agencyId: string; currency: string }>) => {
    const newDateFrom = updates.dateFrom !== undefined ? updates.dateFrom : dateFrom
    const newDateTo = updates.dateTo !== undefined ? updates.dateTo : dateTo
    const newAgencyId = updates.agencyId !== undefined ? updates.agencyId : agencyId
    const newCurrency = updates.currency !== undefined ? updates.currency : currency

    onChange({
      dateFrom: formatDateString(newDateFrom),
      dateTo: formatDateString(newDateTo),
      agencyId: newAgencyId,
      currency: newCurrency,
    })
  }

  const handleReset = () => {
    setDateFrom(defaultValue.dateFrom ? parseISO(defaultValue.dateFrom) : undefined)
    setDateTo(defaultValue.dateTo ? parseISO(defaultValue.dateTo) : undefined)
    setAgencyId(defaultValue.agencyId)
    setCurrency(defaultValue.currency)
    onChange(defaultValue)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={agencyId}
        onValueChange={(v) => {
          setAgencyId(v)
          emitChange({ agencyId: v })
        }}
      >
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
          <SelectValue placeholder="Agencia" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todas las agencias</SelectItem>
          {agencies.map((agency) => (
            <SelectItem key={agency.id} value={agency.id}>
              {agency.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currency}
        onValueChange={(v) => {
          setCurrency(v)
          emitChange({ currency: v })
        }}
      >
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[120px] w-auto">
          <SelectValue placeholder="Moneda" />
        </SelectTrigger>
        <SelectContent>
          {currencyOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DateInputWithCalendar
        value={dateFrom}
        onChange={(date) => {
          setDateFrom(date)
          if (date && dateTo && dateTo < date) {
            setDateTo(undefined)
            emitChange({ dateFrom: date, dateTo: undefined })
          } else {
            emitChange({ dateFrom: date })
          }
        }}
        placeholder="Desde"
        className="h-8 text-xs rounded-full"
      />

      <DateInputWithCalendar
        value={dateTo}
        onChange={(date) => {
          if (date && dateFrom && date < dateFrom) return
          setDateTo(date)
          emitChange({ dateTo: date })
        }}
        placeholder="Hasta"
        minDate={dateFrom}
        className="h-8 text-xs rounded-full"
      />

      <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={handleReset}>
        <X className="mr-1 h-3.5 w-3.5" /> Limpiar
      </Button>
    </div>
  )
}
