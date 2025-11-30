"use client"

import { useState, useMemo } from "react"
import { QuotationsTable } from "@/components/quotations/quotations-table"
import { NewQuotationDialog } from "@/components/quotations/new-quotation-dialog"
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

interface Quotation {
  id: string
  quotation_number: string
  destination: string
  region: string
  status: string
  total_amount: number
  currency: string
  valid_until: string
  created_at: string
  lead_id: string | null
  agency_id: string
  seller_id: string
  operator_id: string | null
  operation_id: string | null
  leads?: { contact_name: string; destination: string; status: string } | null
  agencies?: { name: string } | null
  sellers?: { name: string; email: string } | null
  operators?: { name: string } | null
  operations?: { destination: string; status: string } | null
}

interface QuotationsPageClientProps {
  initialQuotations: Quotation[]
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  operators: Array<{ id: string; name: string }>
  defaultAgencyId?: string
  defaultSellerId?: string
}

export function QuotationsPageClient({
  initialQuotations,
  agencies,
  sellers,
  operators,
  defaultAgencyId,
  defaultSellerId,
}: QuotationsPageClientProps) {
  const [quotations, setQuotations] = useState<Quotation[]>(initialQuotations)
  const [newQuotationDialogOpen, setNewQuotationDialogOpen] = useState(false)
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(defaultAgencyId || agencies[0]?.id || "ALL")
  const [selectedSellerId, setSelectedSellerId] = useState<string>("ALL")
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const handleRefresh = async () => {
    const params = new URLSearchParams()
    if (selectedAgencyId !== "ALL") {
      params.set("agencyId", selectedAgencyId)
    }
    if (selectedSellerId !== "ALL") {
      params.set("sellerId", selectedSellerId)
    }
    if (selectedStatus !== "ALL") {
      params.set("status", selectedStatus)
    }
    if (dateFrom) {
      params.set("dateFrom", dateFrom)
    }
    if (dateTo) {
      params.set("dateTo", dateTo)
    }

    const response = await fetch(`/api/quotations?${params.toString()}`)
    const data = await response.json()
    setQuotations(data.quotations || [])
  }

  // Filtrar cotizaciones
  const filteredQuotations = useMemo(() => {
    let filtered = quotations

    if (selectedAgencyId !== "ALL" && selectedAgencyId) {
      filtered = filtered.filter((q) => q.agency_id === selectedAgencyId)
    }

    if (selectedSellerId !== "ALL" && selectedSellerId) {
      filtered = filtered.filter((q) => q.seller_id === selectedSellerId)
    }

    if (selectedStatus !== "ALL" && selectedStatus) {
      filtered = filtered.filter((q) => q.status === selectedStatus)
    }

    if (dateFrom) {
      filtered = filtered.filter((q) => q.created_at >= dateFrom)
    }

    if (dateTo) {
      filtered = filtered.filter((q) => q.created_at <= dateTo)
    }

    return filtered
  }, [quotations, selectedAgencyId, selectedSellerId, selectedStatus, dateFrom, dateTo])

  const statusOptions = [
    { value: "ALL", label: "Todos los estados" },
    { value: "DRAFT", label: "Borrador" },
    { value: "SENT", label: "Enviada" },
    { value: "PENDING_APPROVAL", label: "Pendiente Aprobación" },
    { value: "APPROVED", label: "Aprobada" },
    { value: "REJECTED", label: "Rechazada" },
    { value: "EXPIRED", label: "Expirada" },
    { value: "CONVERTED", label: "Convertida" },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Cotizaciones</h1>
          <p className="text-muted-foreground">
            Gestiona las cotizaciones formales del sistema
          </p>
        </div>
        <Button onClick={() => setNewQuotationDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Cotización
        </Button>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {agencies.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="agency-select">Sucursal:</Label>
              <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
                <SelectTrigger id="agency-select">
                  <SelectValue placeholder="Seleccionar sucursal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas las sucursales</SelectItem>
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
            <Label htmlFor="seller-select">Vendedor:</Label>
            <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
              <SelectTrigger id="seller-select">
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
            <Label htmlFor="status-select">Estado:</Label>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger id="status-select">
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
      </div>

      {/* Tabla de cotizaciones */}
      <QuotationsTable
        quotations={filteredQuotations}
        agencies={agencies}
        sellers={sellers}
        operators={operators}
        onRefresh={handleRefresh}
      />

      <NewQuotationDialog
        open={newQuotationDialogOpen}
        onOpenChange={setNewQuotationDialogOpen}
        onSuccess={handleRefresh}
        agencies={agencies}
        sellers={sellers}
        operators={operators}
        defaultAgencyId={selectedAgencyId !== "ALL" ? selectedAgencyId : defaultAgencyId}
        defaultSellerId={defaultSellerId}
      />
    </div>
  )
}

