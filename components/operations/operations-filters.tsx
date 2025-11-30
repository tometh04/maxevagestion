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
import { Card, CardContent } from "@/components/ui/card"
import { X } from "lucide-react"
import { DateRangePicker } from "@/components/ui/date-range-picker"

const statusOptions = [
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
  onFilterChange: (filters: {
    status: string
    sellerId: string
    agencyId: string
    dateFrom: string
    dateTo: string
  }) => void
}

export function OperationsFilters({ sellers, agencies, onFilterChange }: OperationsFiltersProps) {
  const [status, setStatus] = useState("ALL")
  const [sellerId, setSellerId] = useState("ALL")
  const [agencyId, setAgencyId] = useState("ALL")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const handleApplyFilters = () => {
    onFilterChange({
      status,
      sellerId,
      agencyId,
      dateFrom,
      dateTo,
    })
  }

  const handleClearFilters = () => {
    setStatus("ALL")
    setSellerId("ALL")
    setAgencyId("ALL")
    setDateFrom("")
    setDateTo("")
    onFilterChange({
      status: "ALL",
      sellerId: "ALL",
      agencyId: "ALL",
      dateFrom: "",
      dateTo: "",
    })
  }

  const hasActiveFilters =
    status !== "ALL" ||
    sellerId !== "ALL" ||
    agencyId !== "ALL" ||
    dateFrom !== "" ||
    dateTo !== ""

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
            <Label>Rango de fechas</Label>
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

