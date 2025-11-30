"use client"

import React, { useState, useEffect, useMemo } from "react"
import { LeadsKanban } from "@/components/sales/leads-kanban"
import { LeadsKanbanTrello } from "@/components/sales/leads-kanban-trello"
import { LeadsTable } from "@/components/sales/leads-table"
import { NewLeadDialog } from "@/components/sales/new-lead-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus } from "lucide-react"

interface Lead {
  id: string
  contact_name: string
  contact_phone: string
  contact_email: string | null
  destination: string
  region: string
  status: string
  trello_url: string | null
  trello_list_id: string | null
  source: string
  agency_id?: string
  created_at: string
  assigned_seller_id: string | null
  users?: { name: string; email: string } | null
  agencies?: { name: string } | null
}

interface LeadsPageClientProps {
  initialLeads: Lead[]
  agencies: Array<{ id: string; name: string }>
  sellers: Array<{ id: string; name: string }>
  defaultAgencyId?: string
  defaultSellerId?: string
  hasTrelloLeads?: boolean
}

export function LeadsPageClient({
  initialLeads,
  agencies,
  sellers,
  defaultAgencyId,
  defaultSellerId,
  hasTrelloLeads = false,
}: LeadsPageClientProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [newLeadDialogOpen, setNewLeadDialogOpen] = useState(false)
  const [selectedAgencyId, setSelectedAgencyId] = useState<string>(defaultAgencyId || agencies[0]?.id || "ALL")
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)

  // Cargar leads cuando cambia la agencia seleccionada
  useEffect(() => {
    if (initialLoad) {
      setInitialLoad(false)
      // Cargar leads iniciales según la agencia seleccionada
      if (selectedAgencyId && selectedAgencyId !== defaultAgencyId) {
        loadLeads(selectedAgencyId)
      }
      return
    }
    loadLeads(selectedAgencyId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgencyId])

  const loadLeads = async (agencyId: string) => {
    setLoading(true)
    try {
      // Cargar leads con límite razonable (200) para mejor rendimiento
      // Si hay Trello leads, cargar más para el Kanban, pero con límite
      const limit = hasTrelloLeads ? 500 : 200
      const url = agencyId === "ALL"
        ? `/api/leads?limit=${limit}`
        : `/api/leads?agencyId=${agencyId}&limit=${limit}`
      const response = await fetch(url)
      const data = await response.json()
      setLeads(data.leads || [])
    } catch (error) {
      console.error("Error loading leads:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    await loadLeads(selectedAgencyId)
  }

  // Los leads ya vienen filtrados del servidor
  const filteredLeads = leads

  // SIEMPRE usar Trello Kanban si hay leads con trello_list_id
  // Verificar si hay leads con trello_list_id (independientemente del source)
  // Usar useMemo para evitar recalcular en cada render
  const trelloLeads = useMemo(
    () => filteredLeads.filter((lead) => lead.trello_list_id !== null && lead.trello_list_id !== undefined),
    [filteredLeads]
  )
  const hasTrelloLeadsInState = trelloLeads.length > 0
  
  // Usar la agencia seleccionada o la primera disponible
  const effectiveAgencyId = selectedAgencyId !== "ALL" 
    ? selectedAgencyId 
    : (trelloLeads[0] as any)?.agency_id || agencies[0]?.id || defaultAgencyId
  
  // FORZAR uso de Trello Kanban si hay leads con trello_list_id Y tenemos agencyId
  const shouldUseTrelloKanban = hasTrelloLeadsInState && !!effectiveAgencyId && effectiveAgencyId !== "ALL"

  // Si hay leads de Trello, SIEMPRE usar el Kanban de Trello
  const KanbanComponent = shouldUseTrelloKanban ? (
    <LeadsKanbanTrello 
      leads={trelloLeads as any} 
      agencyId={effectiveAgencyId!}
      agencies={agencies}
      sellers={sellers}
      onRefresh={handleRefresh}
    />
  ) : (
    <LeadsKanban 
      leads={filteredLeads as any}
      agencies={agencies}
      sellers={sellers}
      onRefresh={handleRefresh}
    />
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Leads</h1>
          <p className="text-muted-foreground">
            {shouldUseTrelloKanban ? "Leads sincronizados desde Trello" : "Gestiona tus leads y oportunidades"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {agencies.length > 0 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="agency-select" className="whitespace-nowrap">Agencia:</Label>
              <Select value={selectedAgencyId} onValueChange={setSelectedAgencyId}>
                <SelectTrigger id="agency-select" className="w-[180px]">
                  <SelectValue placeholder="Seleccionar agencia" />
                </SelectTrigger>
                <SelectContent>
                  {agencies.length > 1 && (
                    <SelectItem value="ALL">Todas las agencias</SelectItem>
                  )}
                  {agencies.map((agency) => (
                    <SelectItem key={agency.id} value={agency.id}>
                      {agency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={() => setNewLeadDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Lead
          </Button>
        </div>
      </div>

      <Tabs defaultValue="kanban" className="w-full">
        <TabsList>
          <TabsTrigger value="kanban">
            {shouldUseTrelloKanban ? "Kanban Trello" : "Kanban"}
          </TabsTrigger>
          <TabsTrigger value="table">Tabla</TabsTrigger>
        </TabsList>
        <TabsContent value="kanban">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Cargando leads...</p>
            </div>
          ) : (
            KanbanComponent
          )}
        </TabsContent>
        <TabsContent value="table" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">Cargando leads...</p>
            </div>
          ) : (
            <LeadsTable
              leads={filteredLeads as any}
              agencies={agencies}
              sellers={sellers}
              onRefresh={handleRefresh}
            />
          )}
        </TabsContent>
      </Tabs>

      <NewLeadDialog
        open={newLeadDialogOpen}
        onOpenChange={setNewLeadDialogOpen}
        onSuccess={handleRefresh}
        agencies={agencies}
        sellers={sellers}
        defaultAgencyId={selectedAgencyId !== "ALL" ? selectedAgencyId : defaultAgencyId}
        defaultSellerId={defaultSellerId}
      />
    </div>
  )
}
