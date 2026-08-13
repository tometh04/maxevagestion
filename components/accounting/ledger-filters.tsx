"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X } from "lucide-react"
import { DateTypeFilter, type DateTypeOption } from "@/components/ui/date-type-filter"
import { format } from "date-fns"

const ledgerDateTypes: DateTypeOption[] = [
  { value: "MOVIMIENTO", label: "Movimiento", shortLabel: "Mov." },
  { value: "OPERACION", label: "Operación", shortLabel: "Op." },
]

export interface LedgerFiltersState {
  dateFrom?: string
  dateTo?: string
  dateType?: string
  type?: string
  currency?: string
  agencyId?: string
  accountId?: string
}

export interface LedgerAccountOption {
  id: string
  name: string
  currency: string
}

interface LedgerFiltersProps {
  agencies: Array<{ id: string; name: string }>
  accounts?: LedgerAccountOption[]
  initialAccountId?: string
  initialCurrency?: string
  onFiltersChange: (filters: LedgerFiltersState) => void
}

export function LedgerFilters({
  agencies,
  accounts = [],
  initialAccountId,
  initialCurrency,
  onFiltersChange,
}: LedgerFiltersProps) {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [dateType, setDateType] = useState<string>("MOVIMIENTO")
  const [type, setType] = useState("ALL")
  const [currency, setCurrency] = useState(initialCurrency || "ALL")
  const [agencyId, setAgencyId] = useState("ALL")
  const [accountId, setAccountId] = useState(initialAccountId || "ALL")

  // Deep-link desde Cuentas Financieras ("Ver movimientos"): aplicar el filtro
  // inicial sin que el usuario tenga que tocar "Aplicar".
  const appliedInitial = useRef(false)
  useEffect(() => {
    if (appliedInitial.current) return
    if (!initialAccountId && !initialCurrency) return
    appliedInitial.current = true
    onFiltersChange({
      accountId: initialAccountId && initialAccountId !== "ALL" ? initialAccountId : undefined,
      currency: initialCurrency && initialCurrency !== "ALL" ? initialCurrency : undefined,
      dateType: "MOVIMIENTO",
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAccountId, initialCurrency])

  const formatDateString = (date: Date | undefined): string | undefined => {
    return date ? format(date, "yyyy-MM-dd") : undefined
  }

  const handleApply = () => {
    onFiltersChange({
      dateFrom: formatDateString(dateFrom),
      dateTo: formatDateString(dateTo),
      dateType: dateType || undefined,
      type: type !== "ALL" ? type : undefined,
      currency: currency !== "ALL" ? currency : undefined,
      agencyId: agencyId !== "ALL" ? agencyId : undefined,
      accountId: accountId !== "ALL" ? accountId : undefined,
    })
  }

  const handleReset = () => {
    setDateFrom(undefined)
    setDateTo(undefined)
    setDateType("MOVIMIENTO")
    setType("ALL")
    setCurrency("ALL")
    setAgencyId("ALL")
    setAccountId("ALL")
    onFiltersChange({})
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DateTypeFilter
        types={ledgerDateTypes}
        includeNone={false}
        value={{ type: dateType, from: dateFrom, to: dateTo }}
        onChange={(v) => {
          setDateType(v.type)
          setDateFrom(v.from)
          setDateTo(v.to)
        }}
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

      {accounts.length > 0 && (
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[180px] w-auto">
            <SelectValue placeholder="Cuenta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las cuentas</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

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
