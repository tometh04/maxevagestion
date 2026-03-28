"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X } from "lucide-react"
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
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [type, setType] = useState("ALL")
  const [currency, setCurrency] = useState("ALL")
  const [agencyId, setAgencyId] = useState("ALL")

  const handleApply = () => {
    onFiltersChange({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      type: type !== "ALL" ? type : undefined,
      currency: currency !== "ALL" ? currency : undefined,
      agencyId: agencyId !== "ALL" ? agencyId : undefined,
    })
  }

  const handleReset = () => {
    setDateFrom("")
    setDateTo("")
    setType("ALL")
    setCurrency("ALL")
    setAgencyId("ALL")
    onFiltersChange({})
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Input
        type="date"
        value={dateFrom}
        onChange={(e) => {
          setDateFrom(e.target.value)
          if (e.target.value && dateTo && dateTo < e.target.value) {
            setDateTo("")
          }
        }}
        className="h-8 text-xs rounded-full border-border/60 bg-background w-[150px]"
        placeholder="Desde"
      />
      <Input
        type="date"
        value={dateTo}
        onChange={(e) => {
          if (e.target.value && dateFrom && e.target.value < dateFrom) {
            return
          }
          setDateTo(e.target.value)
        }}
        min={dateFrom || undefined}
        className="h-8 text-xs rounded-full border-border/60 bg-background w-[150px]"
        placeholder="Hasta"
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
