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
import { Card, CardContent } from "@/components/ui/card"
import { X } from "lucide-react"
import { DateRangePicker } from "@/components/ui/date-range-picker"

const standardStatusOptions = [
  { value: "ALL", label: "Todos los estados" },
  { value: "PRE_RESERVATION", label: "Pre-reserva" },
  { value: "RESERVED", label: "Reservado" },
  { value: "CONFIRMED", label: "Confirmado" },
  { value: "CANCELLED", label: "Cancelado" },
  { value: "TRAVELLED", label: "Viajado" },
  { value: "CLOSED", label: "Cerrado" },
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
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [paymentDateFrom, setPaymentDateFrom] = useState("")
  const [paymentDateTo, setPaymentDateTo] = useState("")
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
      dateFrom,
      dateTo,
      paymentDateFrom: paymentDateType ? paymentDateFrom : undefined,
      paymentDateTo: paymentDateType ? paymentDateTo : undefined,
      paymentDateType: paymentDateType || undefined,
    })
  }

  const handleClearFilters = () => {
    setStatus("ALL")
    setSellerId("ALL")
    setAgencyId("ALL")
    setDateFrom("")
    setDateTo("")
    setPaymentDateFrom("")
    setPaymentDateTo("")
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
    dateFrom !== "" ||
    dateTo !== "" ||
    (paymentDateType !== "" && (paymentDateFrom !== "" || paymentDateTo !== ""))

  return (
    <Card>
      <CardContent className="pt-4 sm:pt-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="status">Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="status">
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

          <div className="space-y-2">
            <Label htmlFor="seller">Vendedor</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger id="seller">
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

          <div className="space-y-2">
            <Label htmlFor="agency">Agencia</Label>
            <Select value={agencyId} onValueChange={setAgencyId}>
              <SelectTrigger id="agency">
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

          <div className="space-y-2">
            <Label>Rango de fechas (viaje)</Label>
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={(from, to) => {
                setDateFrom(from)
                setDateTo(to)
              }}
              placeholder="Seleccionar rango"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentDateType">Filtrar por fecha de</Label>
            <Select value={paymentDateType} onValueChange={setPaymentDateType}>
              <SelectTrigger id="paymentDateType">
                <SelectValue placeholder="Ninguno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Ninguno</SelectItem>
                <SelectItem value="COBRO">Cobro (fecha de pago recibido)</SelectItem>
                <SelectItem value="PAGO">Pago a operador (fecha de pago realizado)</SelectItem>
                <SelectItem value="VENCIMIENTO">Vencimiento (fecha de vencimiento)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {paymentDateType && (
            <div className="space-y-2">
              <Label>Rango de fechas ({paymentDateType === "COBRO" ? "cobro" : paymentDateType === "PAGO" ? "pago" : "vencimiento"})</Label>
              <DateRangePicker
                dateFrom={paymentDateFrom}
                dateTo={paymentDateTo}
                onChange={(from, to) => {
                  setPaymentDateFrom(from)
                  setPaymentDateTo(to)
                }}
                placeholder="Seleccionar rango"
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={handleApplyFilters} className="w-full sm:w-auto">Aplicar Filtros</Button>
          {hasActiveFilters && (
            <Button variant="outline" onClick={handleClearFilters} className="w-full sm:w-auto">
              <X className="mr-2 h-4 w-4" />
              Limpiar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

