"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

const statusOptions = [
  { value: "ALL", label: "Todos los estados" },
  { value: "NEW", label: "Nuevo" },
  { value: "IN_PROGRESS", label: "En Progreso" },
  { value: "QUOTED", label: "Cotizado" },
  { value: "WON", label: "Ganado" },
  { value: "LOST", label: "Perdido" },
]

const regionOptions = [
  { value: "ALL", label: "Todas las regiones" },
  { value: "ARGENTINA", label: "Argentina" },
  { value: "CARIBE", label: "Caribe" },
  { value: "BRASIL", label: "Brasil" },
  { value: "EUROPA", label: "Europa" },
  { value: "EEUU", label: "EEUU" },
  { value: "OTROS", label: "Otros" },
  { value: "CRUCEROS", label: "Cruceros" },
]

interface LeadsFiltersProps {
  sellers: Array<{ id: string; name: string }>
  onFilterChange: (filters: {
    status: string
    region: string
    sellerId: string
    search: string
    dateFrom: string
    dateTo: string
  }) => void
}

export function LeadsFilters({ sellers, onFilterChange }: LeadsFiltersProps) {
  const [status, setStatus] = useState("ALL")
  const [region, setRegion] = useState("ALL")
  const [sellerId, setSellerId] = useState("ALL")
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const handleApplyFilters = () => {
    onFilterChange({
      status,
      region,
      sellerId,
      search,
      dateFrom,
      dateTo,
    })
  }

  const handleClearFilters = () => {
    setStatus("ALL")
    setRegion("ALL")
    setSellerId("ALL")
    setSearch("")
    setDateFrom("")
    setDateTo("")
    onFilterChange({
      status: "ALL",
      region: "ALL",
      sellerId: "ALL",
      search: "",
      dateFrom: "",
      dateTo: "",
    })
  }

  const hasActiveFilters =
    status !== "ALL" ||
    region !== "ALL" ||
    sellerId !== "ALL" ||
    search !== "" ||
    dateFrom !== "" ||
    dateTo !== ""

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="search">Buscar</Label>
            <Input
              id="search"
              placeholder="Nombre, teléfono, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleApplyFilters()
                }
              }}
            />
          </div>

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
            <Label htmlFor="region">Región</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger id="region">
                <SelectValue placeholder="Seleccionar región" />
              </SelectTrigger>
              <SelectContent>
                {regionOptions.map((option) => (
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
            <Label htmlFor="dateFrom">Fecha desde</Label>
            <Input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateTo">Fecha hasta</Label>
            <Input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={handleApplyFilters}>Aplicar Filtros</Button>
          {hasActiveFilters && (
            <Button variant="outline" onClick={handleClearFilters}>
              <X className="mr-2 h-4 w-4" />
              Limpiar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

