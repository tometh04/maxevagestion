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
import { Search, X } from "lucide-react"
import { DateTypeFilter, type DateTypeOption } from "@/components/ui/date-type-filter"
import { format, parseISO, isValid } from "date-fns"

const leadsDateTypes: DateTypeOption[] = [
  { value: "CREACION", label: "Creación", shortLabel: "Creac." },
]

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

function toDate(s: string): Date | undefined {
  if (!s) return undefined
  try {
    const d = parseISO(s)
    return isValid(d) ? d : undefined
  } catch { return undefined }
}

function toStr(d: Date | undefined): string {
  return d ? format(d, "yyyy-MM-dd") : ""
}

export function LeadsFilters({ sellers, onFilterChange }: LeadsFiltersProps) {
  const [status, setStatus] = useState("ALL")
  const [region, setRegion] = useState("ALL")
  const [sellerId, setSellerId] = useState("ALL")
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)

  const handleApplyFilters = () => {
    onFilterChange({
      status,
      region,
      sellerId,
      search,
      dateFrom: toStr(dateFrom),
      dateTo: toStr(dateTo),
    })
  }

  const handleClearFilters = () => {
    setStatus("ALL")
    setRegion("ALL")
    setSellerId("ALL")
    setSearch("")
    setDateFrom(undefined)
    setDateTo(undefined)
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
    dateFrom !== undefined ||
    dateTo !== undefined

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Nombre, teléfono, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleApplyFilters()
            }
          }}
          className="pl-9 h-8 text-xs rounded-full"
        />
      </div>

      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
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

      <Select value={region} onValueChange={setRegion}>
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
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

      <Select value={sellerId} onValueChange={setSellerId}>
        <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px] w-auto">
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

      <DateTypeFilter
        types={leadsDateTypes}
        includeNone={false}
        value={{ type: "CREACION", from: dateFrom, to: dateTo }}
        onChange={(v) => {
          setDateFrom(v.from)
          setDateTo(v.to)
        }}
      />

      <Button variant="outline" size="sm" onClick={handleApplyFilters} className="h-8 rounded-full text-xs">Aplicar Filtros</Button>
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-8 rounded-full text-xs">
          <X className="mr-1 h-3.5 w-3.5" />
          Limpiar
        </Button>
      )}
    </div>
  )
}
