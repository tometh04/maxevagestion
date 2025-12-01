"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExternalLink, DollarSign, UserPlus, Loader2 } from "lucide-react"
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
import { toast } from "sonner"

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
  currentUserId?: string
  currentUserRole?: string
}

export function LeadsKanbanTrello({ leads, agencyId, agencies = [], sellers = [], onRefresh, currentUserId, currentUserRole }: LeadsKanbanTrelloProps) {
  const [lists, setLists] = useState<TrelloList[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedLead, setDraggedLead] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedListId, setSelectedListId] = useState<string>("ALL")
  const [claimingLeadId, setClaimingLeadId] = useState<string | null>(null)

  // Determinar si el usuario puede "agarrar" leads
  // Vendedores pueden agarrar, Admins también pueden (para asignarse o reasignar)
  const canClaimLeads = currentUserRole === "SELLER" || currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN"

  // Función para "agarrar" un lead
  const handleClaimLead = async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Evitar abrir el dialog
    
    setClaimingLeadId(leadId)
    try {
      const response = await fetch("/api/leads/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || "Error al agarrar el lead")
        return
      }

      toast.success(data.message || "¡Lead asignado!")
      
      if (data.warning) {
        toast.warning(data.warning, { duration: 5000 })
      }

      // Refrescar la lista
      if (onRefresh) {
        onRefresh()
      }
    } catch (error) {
      console.error("Error claiming lead:", error)
      toast.error("Error al agarrar el lead")
    } finally {
      setClaimingLeadId(null)
    }
  }

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
  // CRÍTICO: Mostrar EXACTAMENTE las mismas listas que hay en Trello, con las cards en cada lista
  const leadsByList = lists.reduce((acc, list) => {
    // Filtrar leads que pertenecen a esta lista específica
    acc[list.id] = leads.filter((lead) => {
      // Solo leads de Trello que tienen este trello_list_id
      return lead.source === "Trello" && lead.trello_list_id === list.id
    })
    return acc
  }, {} as Record<string, Lead[]>)
  
  // DEBUG: Log para verificar
  console.log("📊 Leads por lista:", Object.entries(leadsByList).map(([listId, leads]) => {
    const listName = lists.find(l => l.id === listId)?.name || "Unknown"
    return `${listName}: ${leads.length}`
  }))
  console.log("📊 Total leads de Trello:", leads.filter(l => l.source === "Trello").length)
  console.log("📊 Leads con trello_list_id:", leads.filter(l => l.trello_list_id).length)

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

    // No hacer nada si se suelta en la misma lista
    if (lead.trello_list_id === listId) {
      setDraggedLead(null)
      return
    }

    // Mover la tarjeta en Trello (el endpoint ahora mueve en Trello + actualiza BD)
    try {
      const response = await fetch("/api/leads/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: draggedLead, trelloListId: listId }),
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // La actualización llegará por Realtime, pero refrescamos por si acaso
        if (onRefresh) {
          onRefresh()
        }
      } else {
        console.error("Error moviendo lead:", data.error)
        alert("Error al mover la tarjeta: " + (data.error || "Error desconocido"))
      }
    } catch (error) {
      console.error("Error updating lead list:", error)
      alert("Error al mover la tarjeta")
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
          <div 
            key={list.id} 
            className="flex min-w-[280px] flex-col"
            onDragOver={(e) => {
              e.preventDefault()
              e.currentTarget.classList.add('bg-primary/10')
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove('bg-primary/10')
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.currentTarget.classList.remove('bg-primary/10')
              handleDrop(list.id)
            }}
          >
            <div className="rounded-t-lg bg-muted p-3">
              <h3 className="font-semibold">{list.name}</h3>
              <span className="text-sm text-muted-foreground">{listLeads.length} leads</span>
            </div>
            <ScrollArea className="h-[calc(100vh-250px)] rounded-b-lg border bg-muted/30">
              <div className="p-2 min-h-[100px]">
                {listLeads.length > 0 ? (
                  listLeads.map((lead) => (
                    <Card
                      key={lead.id}
                      className="mb-2 cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors border-2 border-transparent hover:border-primary/30"
                      onClick={(e) => {
                        // Solo abrir el dialog si no se está arrastrando
                        if (!draggedLead) {
                          e.stopPropagation()
                          setSelectedLead(lead)
                          setDialogOpen(true)
                        }
                      }}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', lead.id)
                        handleDragStart(lead.id)
                      }}
                      onDragEnd={() => setDraggedLead(null)}
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
                          {/* Mostrar vendedor asignado o botón para agarrar */}
                          {lead.users ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs">
                                  {(lead.users.name || "")
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                    .toUpperCase()
                                    .slice(0, 2) || "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground">{lead.users.name || "Sin nombre"}</span>
                            </div>
                          ) : canClaimLeads ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-orange-600 hover:bg-orange-100 hover:text-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                              onClick={(e) => handleClaimLead(lead.id, e)}
                              disabled={claimingLeadId === lead.id}
                            >
                              {claimingLeadId === lead.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <UserPlus className="h-3 w-3 mr-1" />
                                  Agarrar
                                </>
                              )}
                            </Button>
                          ) : !lead.assigned_seller_id ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Sin asignar
                            </Badge>
                          ) : null}
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
          canClaimLeads={canClaimLeads}
          onClaim={onRefresh}
        />
      )}
      </div>
    </div>
  )
}

