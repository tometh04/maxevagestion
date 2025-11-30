"use client"

import { useState, useMemo } from "react"
import { QuotasTable } from "@/components/quotas/quotas-table"
import { NewQuotaDialog } from "@/components/quotas/new-quota-dialog"
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

interface Quota {
  id: string
  destination: string
  accommodation_name: string | null
  room_type: string | null
  date_from: string
  date_to: string
  total_quota: number
  reserved_quota: number
  available_quota: number
  is_active: boolean
  operator_id: string
  tariff_id: string | null
  notes: string | null
  created_at: string
  operators?: { name: string } | null
  tariffs?: { name: string; destination: string } | null
}

interface QuotasPageClientProps {
  initialQuotas: Quota[]
  operators: Array<{ id: string; name: string }>
}

export function QuotasPageClient({
  initialQuotas,
  operators,
}: QuotasPageClientProps) {
  const [quotas, setQuotas] = useState<Quota[]>(initialQuotas)
  const [newQuotaDialogOpen, setNewQuotaDialogOpen] = useState(false)
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>("ALL")
  const [searchDestination, setSearchDestination] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [showActiveOnly, setShowActiveOnly] = useState(true)

  const handleRefresh = async () => {
    const params = new URLSearchParams()
    if (selectedOperatorId !== "ALL") {
      params.set("operatorId", selectedOperatorId)
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

    const response = await fetch(`/api/quotas?${params.toString()}`)
    const data = await response.json()
    setQuotas(data.quotas || [])
  }

  // Filtrar cupos
  const filteredQuotas = useMemo(() => {
    let filtered = quotas

    if (selectedOperatorId !== "ALL" && selectedOperatorId) {
      filtered = filtered.filter((q) => q.operator_id === selectedOperatorId)
    }

    if (searchDestination) {
      filtered = filtered.filter((q) =>
        q.destination.toLowerCase().includes(searchDestination.toLowerCase()) ||
        (q.accommodation_name && q.accommodation_name.toLowerCase().includes(searchDestination.toLowerCase()))
      )
    }

    if (showActiveOnly) {
      filtered = filtered.filter((q) => q.is_active)
    }

    if (dateFrom) {
      filtered = filtered.filter((q) => q.date_to >= dateFrom)
    }

    if (dateTo) {
      filtered = filtered.filter((q) => q.date_from <= dateTo)
    }

    return filtered
  }, [
    quotas,
    selectedOperatorId,
    searchDestination,
    showActiveOnly,
    dateFrom,
    dateTo,
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Cupos</h1>
          <p className="text-muted-foreground">
            Gestiona los cupos disponibles de operadores
          </p>
        </div>
        <Button onClick={() => setNewQuotaDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Cupo
        </Button>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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

          <div className="space-y-2">
            <Label htmlFor="destination-search">Destino/Alojamiento:</Label>
            <Input
              id="destination-search"
              placeholder="Buscar destino o alojamiento..."
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
            Mostrar solo cupos activos
          </Label>
        </div>
      </div>

      {/* Tabla de cupos */}
      <QuotasTable
        quotas={filteredQuotas}
        operators={operators}
        onRefresh={handleRefresh}
      />

      <NewQuotaDialog
        open={newQuotaDialogOpen}
        onOpenChange={setNewQuotaDialogOpen}
        onSuccess={handleRefresh}
        operators={operators}
      />
    </div>
  )
}

