"use client"

import { useState, useMemo } from "react"
import { TariffsTable } from "@/components/tariffs/tariffs-table"
import { NewTariffDialog } from "@/components/tariffs/new-tariff-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

interface Tariff {
  id: string
  name: string
  destination: string
  region: string
  valid_from: string
  valid_to: string
  tariff_type: string
  currency: string
  is_active: boolean
  operator_id: string
  agency_id: string | null
  created_at: string
  operators?: { name: string } | null
  agencies?: { name: string } | null
  created_by_user?: { name: string } | null
}

interface TariffsPageClientProps {
  initialTariffs: Tariff[]
  agencies: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  defaultAgencyId?: string
}

export function TariffsPageClient({
  initialTariffs,
  agencies,
  operators,
  defaultAgencyId,
}: TariffsPageClientProps) {
  const [tariffs, setTariffs] = useState<Tariff[]>(initialTariffs)
  const [newTariffDialogOpen, setNewTariffDialogOpen] = useState(false)
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>("ALL")
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(defaultAgencyId || "ALL")
  const [selectedRegion, setSelectedRegion] = useState<string>("ALL")
  const [searchDestination, setSearchDestination] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [showActiveOnly, setShowActiveOnly] = useState(true)

  const handleRefresh = async () => {
    const params = new URLSearchParams()
    if (selectedOperatorId !== "ALL") {
      params.set("operatorId", selectedOperatorId)
    }
    if (selectedAgencyId !== "ALL" && selectedAgencyId) {
      params.set("agencyId", selectedAgencyId)
    }
    if (selectedRegion !== "ALL") {
      params.set("region", selectedRegion)
    }
    if (searchDestination) {
      params.set("destination", searchDestination)
    }
    if (dateFrom) {
      params.set("dateFrom", dateFrom)
    }
    if (dateTo) {
      params.set("dateTo", dateTo)
    }
    if (showActiveOnly) {
      params.set("isActive", "true")
    }

    const response = await fetch(`/api/tariffs?${params.toString()}`)
    const data = await response.json()
    setTariffs(data.tariffs || [])
  }

  // Filtrar tarifarios
  const filteredTariffs = useMemo(() => {
    let filtered = tariffs

    if (selectedOperatorId !== "ALL" && selectedOperatorId) {
      filtered = filtered.filter((t) => t.operator_id === selectedOperatorId)
    }

    if (selectedAgencyId !== "ALL" && selectedAgencyId) {
      filtered = filtered.filter((t) => t.agency_id === selectedAgencyId)
    } else if (selectedAgencyId === "ALL") {
      // Show all (global + agency specific)
    }

    if (selectedRegion !== "ALL" && selectedRegion) {
      filtered = filtered.filter((t) => t.region === selectedRegion)
    }

    if (searchDestination) {
      filtered = filtered.filter((t) =>
        t.destination.toLowerCase().includes(searchDestination.toLowerCase())
      )
    }

    if (showActiveOnly) {
      filtered = filtered.filter((t) => t.is_active)
    }

    if (dateFrom) {
      filtered = filtered.filter((t) => t.valid_to >= dateFrom)
    }

    if (dateTo) {
      filtered = filtered.filter((t) => t.valid_from <= dateTo)
    }

    return filtered
  }, [
    tariffs,
    selectedOperatorId,
    selectedAgencyId,
    selectedRegion,
    searchDestination,
    showActiveOnly,
    dateFrom,
    dateTo,
  ])

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Tarifarios</h1>
          <p className="text-muted-foreground">
            Gestiona los tarifarios de operadores
          </p>
        </div>
        <Button onClick={() => setNewTariffDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Tarifario
        </Button>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <div className="space-y-2">
            <Label htmlFor="operator-select">Operador:</Label>
            <Select value={selectedOperatorId} onValueChange={setSelectedOperatorId}>
              <SelectTrigger id="operator-select">
                <SelectValue placeholder="Seleccionar operador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los operadores</SelectItem>
                {operators.map((operator) => (
                  <SelectItem key={operator.id} value={operator.id}>
                    {operator.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {agencies.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="agency-select">Sucursal:</Label>
              <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
                <SelectTrigger id="agency-select">
                  <SelectValue placeholder="Seleccionar sucursal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas (Global + Sucursales)</SelectItem>
                  {agencies.map((agency) => (
                    <SelectItem key={agency.id} value={agency.id}>
                      {agency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="region-select">Región:</Label>
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger id="region-select">
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
            <Label htmlFor="destination-search">Destino:</Label>
            <Input
              id="destination-search"
              placeholder="Buscar destino..."
              value={searchDestination}
              onChange={(e) => setSearchDestination(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Rango de fechas:</Label>
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

          <div className="flex items-end">
            <Button onClick={handleRefresh} variant="outline" className="w-full">
              Actualizar
            </Button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="show-active-only"
            checked={showActiveOnly}
            onCheckedChange={setShowActiveOnly}
          />
          <Label htmlFor="show-active-only" className="cursor-pointer">
            Mostrar solo tarifarios activos
          </Label>
        </div>
      </div>

      {/* Tabla de tarifarios */}
      <TariffsTable
        tariffs={filteredTariffs}
        operators={operators}
        agencies={agencies}
        onRefresh={handleRefresh}
      />

      <NewTariffDialog
        open={newTariffDialogOpen}
        onOpenChange={setNewTariffDialogOpen}
        onSuccess={handleRefresh}
        operators={operators}
        agencies={agencies}
        defaultAgencyId={selectedAgencyId !== "ALL" ? selectedAgencyId : defaultAgencyId}
      />
    </div>
  )
}

