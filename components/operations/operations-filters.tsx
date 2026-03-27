"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X } from "lucide-react"
import { DateInputWithCalendar } from "@/components/ui/date-input-with-calendar"
import { format, parseISO } from "date-fns"

const standardStatusOptions = [
  { value: "ALL", label: "Todos los estados" },
  { value: "RESERVED", label: "Reservado" },
  { value: "CONFIRMED", label: "Confirmado" },
  { value: "CANCELLED", label: "Cancelado" },
  { value: "TRAVELLING", label: "En viaje" },
  { value: "TRAVELLED", label: "Viajado" },
]

interface OperationsFiltersProps {
  sellers: Array<{ id: string; name: string }>
  agencies: Array<{ id: string; name: string }>
  customStatuses?: Array<{ value: string; label: string; color?: string }>
  onFilterChange: (filters: {
    status: string
    sellerId: string
    agencyId: string
    dateFrom: string
    dateTo: string
    paymentDateFrom?: string
    paymentDateTo?: string
    paymentDateType?: string
  }) => void
}

export function OperationsFilters({ sellers, agencies, customStatuses = [], onFilterChange }: OperationsFiltersProps) {
  const [status, setStatus] = useState("ALL")
  const [sellerId, setSellerId] = useState("ALL")
  const [agencyId, setAgencyId] = useState("ALL")
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [paymentDateFrom, setPaymentDateFrom] = useState<Date | undefined>(undefined)
  const [paymentDateTo, setPaymentDateTo] = useState<Date | undefined>(undefined)
  
  // Helper para convertir Date a string
  const formatDateString = (date: Date | undefined): string => {
    return date ? format(date, "yyyy-MM-dd") : ""
  }
  
  // Helper para parsear string a Date
  const parseDateString = (dateString: string): Date | undefined => {
    if (!dateString) return undefined
    try {
      return parseISO(dateString)
    } catch {
      return undefined
    }
  }
  const [paymentDateType, setPaymentDateType] = useState("")

  // Combinar estados estándar con personalizados
  const statusOptions = [
    ...standardStatusOptions,
    ...customStatuses.map(s => ({ value: s.value, label: s.label }))
  ]

  const handleApplyFilters = () => {
    onFilterChange({
      status,
      sellerId,
      agencyId,
      dateFrom: formatDateString(dateFrom),
      dateTo: formatDateString(dateTo),
      paymentDateFrom: paymentDateType ? formatDateString(paymentDateFrom) : undefined,
      paymentDateTo: paymentDateType ? formatDateString(paymentDateTo) : undefined,
      paymentDateType: paymentDateType || undefined,
    })
  }

  const handleClearFilters = () => {
    setStatus("ALL")
    setSellerId("ALL")
    setAgencyId("ALL")
    setDateFrom(undefined)
    setDateTo(undefined)
    setPaymentDateFrom(undefined)
    setPaymentDateTo(undefined)
    setPaymentDateType("")
    onFilterChange({
      status: "ALL",
      sellerId: "ALL",
      agencyId: "ALL",
      dateFrom: "",
      dateTo: "",
      paymentDateFrom: undefined,
      paymentDateTo: undefined,
      paymentDateType: undefined,
    })
  }

  const hasActiveFilters =
    status !== "ALL" ||
    sellerId !== "ALL" ||
    agencyId !== "ALL" ||
    dateFrom !== undefined ||
    dateTo !== undefined ||
    (paymentDateType !== "" && (paymentDateFrom !== undefined || paymentDateTo !== undefined))

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Estado</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger id="status" className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
            <SelectValue placeholder="Seleccionar estado" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Vendedor</Label>
        <Select value={sellerId} onValueChange={setSellerId}>
          <SelectTrigger id="seller" className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
            <SelectValue placeholder="Seleccionar vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los vendedores</SelectItem>
            {sellers.map((seller) => (
              <SelectItem key={seller.id} value={seller.id}>
                {seller.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Agencia</Label>
        <Select value={agencyId} onValueChange={setAgencyId}>
          <SelectTrigger id="agency" className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
            <SelectValue placeholder="Seleccionar agencia" />
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
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Viaje Desde</Label>
        <DateInputWithCalendar
          value={dateFrom}
          onChange={(date) => {
            setDateFrom(date)
            if (date && dateTo && dateTo < date) {
              setDateTo(undefined)
            }
          }}
          placeholder="dd/MM/yyyy"
          className="h-8 text-xs"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Viaje Hasta</Label>
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
          className="h-8 text-xs"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground whitespace-nowrap">Fecha de</Label>
        <Select value={paymentDateType} onValueChange={setPaymentDateType}>
          <SelectTrigger id="paymentDateType" className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
            <SelectValue placeholder="Ninguno" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">Ninguno</SelectItem>
            <SelectItem value="OPERACION">Operación</SelectItem>
            <SelectItem value="COBRO">Cobro</SelectItem>
            <SelectItem value="PAGO">Pago</SelectItem>
            <SelectItem value="VENCIMIENTO">Vencimiento</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {paymentDateType && paymentDateType !== "NONE" && (
        <>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">
              {paymentDateType === "OPERACION" ? "Op. Desde"
                : paymentDateType === "COBRO" ? "Cobro Desde"
                : paymentDateType === "PAGO" ? "Pago Desde"
                : "Venc. Desde"}
            </Label>
            <DateInputWithCalendar
              value={paymentDateFrom}
              onChange={(date) => {
                setPaymentDateFrom(date)
                if (date && paymentDateTo && paymentDateTo < date) {
                  setPaymentDateTo(undefined)
                }
              }}
              placeholder="dd/MM/yyyy"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">
              {paymentDateType === "OPERACION" ? "Op. Hasta"
                : paymentDateType === "COBRO" ? "Cobro Hasta"
                : paymentDateType === "PAGO" ? "Pago Hasta"
                : "Venc. Hasta"}
            </Label>
            <DateInputWithCalendar
              value={paymentDateTo}
              onChange={(date) => {
                if (date && paymentDateFrom && date < paymentDateFrom) {
                  return
                }
                setPaymentDateTo(date)
              }}
              placeholder="dd/MM/yyyy"
              minDate={paymentDateFrom}
              className="h-8 text-xs"
            />
          </div>
        </>
      )}

      <Button variant="outline" size="sm" onClick={handleApplyFilters} className="rounded-full h-8 text-xs">Aplicar Filtros</Button>
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-xs text-muted-foreground">
          <X className="mr-1 h-3 w-3" />
          Limpiar
        </Button>
      )}
    </div>
  )
}

