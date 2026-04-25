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
import { Input } from "@/components/ui/input"
import { Search, X } from "lucide-react"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { DateTypeFilter, type DateTypeOption } from "@/components/ui/date-type-filter"
import { format, parseISO } from "date-fns"

export interface CashFiltersState {
  dateFrom: string
  dateTo: string
  dateType?: string
  agencyId: string
  currency: string
  customerQuery?: string
}

interface CashFiltersProps {
  agencies: Array<{ id: string; name: string }>
  value: CashFiltersState
  defaultValue: CashFiltersState
  onChange: (filters: CashFiltersState) => void
  /**
   * Si se provee, reemplaza los date pickers planos por un selector de TIPO de fecha
   * (Movimiento / Operación / Pago / etc.) con Desde/Hasta dinámicos.
   * Si no se provee, mantiene el comportamiento legacy (Desde/Hasta sin tipo).
   */
  dateTypes?: DateTypeOption[]
}

const currencyOptions = [
  { value: "ARS", label: "ARS" },
  { value: "USD", label: "USD" },
  { value: "ALL", label: "Todas" },
]

export function CashFilters({ agencies, value, defaultValue, onChange, dateTypes }: CashFiltersProps) {
  const [agencyId, setAgencyId] = useState(value.agencyId)
  const [currency, setCurrency] = useState(value.currency)
  const [dateFrom, setDateFrom] = useState<Date | undefined>(
    value.dateFrom ? parseISO(value.dateFrom) : undefined
  )
  const [dateTo, setDateTo] = useState<Date | undefined>(
    value.dateTo ? parseISO(value.dateTo) : undefined
  )
  const [dateType, setDateType] = useState<string>(value.dateType || "")
  const [customerQuery, setCustomerQuery] = useState(value.customerQuery || "")

  // Sync external value changes
  useEffect(() => {
    setAgencyId(value.agencyId)
    setCurrency(value.currency)
    setDateFrom(value.dateFrom ? parseISO(value.dateFrom) : undefined)
    setDateTo(value.dateTo ? parseISO(value.dateTo) : undefined)
    setDateType(value.dateType || "")
    setCustomerQuery(value.customerQuery || "")
  }, [value])

  // Debounce de búsqueda de cliente (evita un request por cada tecla)
  useEffect(() => {
    if (customerQuery === (value.customerQuery || "")) return
    const t = setTimeout(() => {
      onChange({
        dateFrom: formatDateString(dateFrom),
        dateTo: formatDateString(dateTo),
        agencyId,
        currency,
        customerQuery: customerQuery.trim() || undefined,
      })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerQuery])

  const formatDateString = (date: Date | undefined): string => {
    return date ? format(date, "yyyy-MM-dd") : ""
  }

  // Notify parent on any change
  const emitChange = (updates: Partial<{ dateFrom: Date | undefined; dateTo: Date | undefined; dateType: string; agencyId: string; currency: string; customerQuery: string }>) => {
    const newDateFrom = updates.dateFrom !== undefined ? updates.dateFrom : dateFrom
    const newDateTo = updates.dateTo !== undefined ? updates.dateTo : dateTo
    const newDateType = updates.dateType !== undefined ? updates.dateType : dateType
    const newAgencyId = updates.agencyId !== undefined ? updates.agencyId : agencyId
    const newCurrency = updates.currency !== undefined ? updates.currency : currency
    const newCustomerQuery = updates.customerQuery !== undefined ? updates.customerQuery : customerQuery

    onChange({
      dateFrom: formatDateString(newDateFrom),
      dateTo: formatDateString(newDateTo),
      dateType: newDateType || undefined,
      agencyId: newAgencyId,
      currency: newCurrency,
      customerQuery: newCustomerQuery.trim() || undefined,
    })
  }

  const handleReset = () => {
    setDateFrom(defaultValue.dateFrom ? parseISO(defaultValue.dateFrom) : undefined)
    setDateTo(defaultValue.dateTo ? parseISO(defaultValue.dateTo) : undefined)
    setDateType(defaultValue.dateType || "")
    setAgencyId(defaultValue.agencyId)
    setCurrency(defaultValue.currency)
    setCustomerQuery(defaultValue.customerQuery || "")
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

      {dateTypes ? (
        <DateTypeFilter
          types={dateTypes}
          includeNone={false}
          value={{ type: dateType, from: dateFrom, to: dateTo }}
          onChange={(v) => {
            setDateType(v.type)
            setDateFrom(v.from)
            setDateTo(v.to)
            emitChange({ dateType: v.type, dateFrom: v.from, dateTo: v.to })
          }}
        />
      ) : (
        <>
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
        </>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={customerQuery}
          onChange={(e) => setCustomerQuery(e.target.value)}
          placeholder="Cliente..."
          className="h-8 text-xs rounded-full pl-8 w-[180px]"
        />
      </div>

      <Button variant="ghost" size="sm" className="h-8 rounded-full text-xs" onClick={handleReset}>
        <X className="mr-1 h-3.5 w-3.5" /> Limpiar
      </Button>
    </div>
  )
}
