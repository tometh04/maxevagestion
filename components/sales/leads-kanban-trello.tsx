"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExternalLink, DollarSign } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { LeadDetailDialog } from "@/components/sales/lead-detail-dialog"

const regionColors: Record<string, string> = {
  ARGENTINA: "bg-blue-500",
  CARIBE: "bg-cyan-500",
  BRASIL: "bg-green-500",
  EUROPA: "bg-purple-500",
  EEUU: "bg-red-500",
  OTROS: "bg-gray-500",
  CRUCEROS: "bg-orange-500",
}

interface Lead {
  id: string
  contact_name: string
  contact_phone: string
  contact_email: string | null
  contact_instagram: string | null
  destination: string
  region: string
  status: string
  source: string
  trello_url: string | null
  trello_list_id: string | null
  assigned_seller_id: string | null
  agency_id?: string
  created_at: string
  updated_at?: string
  notes: string | null
  has_deposit?: boolean
  deposit_amount?: number | null
  deposit_currency?: string | null
  users?: { name: string; email: string } | null
  agencies?: { name: string } | null
}

interface TrelloList {
  id: string
  name: string
}

interface LeadsKanbanTrelloProps {
  leads: Lead[]
  agencyId: string
  agencies?: Array<{ id: string; name: string }>
  sellers?: Array<{ id: string; name: string }>
  onRefresh?: () => void
}

export function LeadsKanbanTrello({ leads, agencyId, agencies = [], sellers = [], onRefresh }: LeadsKanbanTrelloProps) {
  const [lists, setLists] = useState<TrelloList[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedLead, setDraggedLead] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedListId, setSelectedListId] = useState<string>("ALL")

  // Obtener listas de Trello - MOSTRAR TODAS LAS LISTAS en el orden EXACTO que están en Trello
  useEffect(() => {
    async function fetchLists() {
      try {
        const response = await fetch(`/api/trello/lists?agencyId=${agencyId}`)
        const data = await response.json()
        if (data.lists && Array.isArray(data.lists)) {
          // Las listas ya vienen ordenadas por pos desde la API
          // Usar el orden exacto que viene de la API (ya está ordenado correctamente)
          setLists(data.lists)
        } else {
          console.error("❌ No se obtuvieron listas de Trello:", data)
        }
      } catch (error) {
        console.error("❌ Error fetching Trello lists:", error)
      } finally {
        setLoading(false)
      }
    }

    if (agencyId) {
      fetchLists()
    } else {
      console.error("❌ No hay agencyId para obtener listas de Trello")
      setLoading(false)
    }
  }, [agencyId])

  // Agrupar leads por lista de Trello
  const leadsByList = lists.reduce((acc, list) => {
    acc[list.id] = leads.filter((lead) => lead.trello_list_id === list.id)
    return acc
  }, {} as Record<string, Lead[]>)

  // Filtrar listas según el selector
  const filteredLists = selectedListId === "ALL" 
    ? lists 
    : lists.filter(list => list.id === selectedListId)

  const handleDragStart = (leadId: string) => {
    setDraggedLead(leadId)
  }

  const handleDrop = async (listId: string) => {
    if (!draggedLead) return

    // Encontrar el lead
    const lead = leads.find((l) => l.id === draggedLead)
    if (!lead) return

    // Actualizar el lead moviéndolo a la nueva lista
    // Esto actualizará el trello_list_id y también el status/region según el mapeo
    try {
      // Primero necesitamos obtener el mapeo de listas para determinar el nuevo status
      const response = await fetch(`/api/trello/lists?agencyId=${agencyId}`)
      const data = await response.json()
      
      // Por ahora, solo actualizamos el trello_list_id
      // El webhook de Trello se encargará de actualizar el status cuando se mueva la tarjeta en Trello
      await fetch("/api/leads/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: draggedLead, trelloListId: listId }),
      })
      
      window.location.reload()
    } catch (error) {
      console.error("Error updating lead list:", error)
    } finally {
      setDraggedLead(null)
    }
  }

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex min-w-[280px] flex-col">
            <Skeleton className="h-16 rounded-t-lg" />
            <Skeleton className="h-[calc(100vh-250px)] rounded-b-lg" />
          </div>
        ))}
      </div>
    )
  }

  if (lists.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">No se encontraron listas de Trello. Configura Trello en Settings.</p>
      </div>
    )
  }

  // Mostrar TODAS las listas de Trello, en el orden exacto que vienen de Trello
  return (
    <div className="space-y-4">
      {/* Filtro de listas */}
      <div className="flex items-center gap-2">
        <Label htmlFor="list-filter" className="whitespace-nowrap">Filtrar por lista:</Label>
        <Select value={selectedListId} onValueChange={setSelectedListId}>
          <SelectTrigger id="list-filter" className="w-[250px]">
            <SelectValue placeholder="Todas las listas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas las listas</SelectItem>
            {lists.map((list) => (
              <SelectItem key={list.id} value={list.id}>
                {list.name} ({leadsByList[list.id]?.length || 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {filteredLists.map((list) => {
        const listLeads = leadsByList[list.id] || []

        // Mostrar TODAS las listas, incluso si no tienen leads
        return (
          <div key={list.id} className="flex min-w-[280px] flex-col">
            <div className="rounded-t-lg bg-muted p-3">
              <h3 className="font-semibold">{list.name}</h3>
              <span className="text-sm text-muted-foreground">{listLeads.length} leads</span>
            </div>
            <ScrollArea className="h-[calc(100vh-250px)] rounded-b-lg border bg-muted/30">
              <div
                className="p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  handleDrop(list.id)
                }}
              >
                {listLeads.length > 0 ? (
                  listLeads.map((lead) => (
                    <Card
                      key={lead.id}
                      className="mb-2 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={(e) => {
                        // Solo abrir el dialog si no se está arrastrando
                        if (!draggedLead) {
                          e.stopPropagation()
                          setSelectedLead(lead)
                          setDialogOpen(true)
                        }
                      }}
                      draggable
                      onDragStart={() => handleDragStart(lead.id)}
                    >
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <span className="font-medium hover:underline cursor-pointer">
                              {lead.contact_name}
                            </span>
                            {lead.trello_url && (
                              <a
                                href={lead.trello_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                          {lead.destination && lead.destination !== "Sin destino" && (
                            <p className="text-sm text-muted-foreground">{lead.destination}</p>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={regionColors[lead.region] ? `${regionColors[lead.region]} text-white border-0` : ""}
                            >
                              {lead.region}
                            </Badge>
                            {lead.has_deposit && lead.deposit_amount && (
                              <Badge variant="outline" className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/50">
                                <DollarSign className="h-3 w-3 mr-1" />
                                {lead.deposit_amount} {lead.deposit_currency || "ARS"}
                              </Badge>
                            )}
                          </div>
                          {lead.users && (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs">
                                  {lead.users.name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                    .toUpperCase()
                                    .slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground">{lead.users.name}</span>
                            </div>
                          )}
                          {lead.notes && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{lead.notes}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No hay leads en esta lista
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )
      })}

      {selectedLead && (
        <LeadDetailDialog
          lead={selectedLead as any}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          agencies={agencies}
          sellers={sellers}
          onDelete={onRefresh}
          onConvert={onRefresh}
        />
      )}
      </div>
    </div>
  )
}

