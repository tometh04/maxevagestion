"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExternalLink, DollarSign, UserPlus, Loader2, Settings2, Plus } from "lucide-react"
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
import { EditListOrderDialog } from "@/components/sales/edit-list-order-dialog"
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
  list_name: string | null
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

interface ListInfo {
  name: string
  id: string // ID temporal para referencia visual
}

interface LeadsKanbanManychatProps {
  leads: Lead[]
  agencyId: string
  agencies?: Array<{ id: string; name: string }>
  sellers?: Array<{ id: string; name: string }>
  operators?: Array<{ id: string; name: string }>
  onRefresh?: () => void
  currentUserId?: string
  currentUserRole?: string
}

export function LeadsKanbanManychat({ 
  leads, 
  agencyId, 
  agencies = [], 
  sellers = [], 
  operators = [], 
  onRefresh, 
  currentUserId, 
  currentUserRole 
}: LeadsKanbanManychatProps) {
  const [listOrder, setListOrder] = useState<ListInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedListName, setSelectedListName] = useState<string>("ALL")
  const [claimingLeadId, setClaimingLeadId] = useState<string | null>(null)
  const [editOrderDialogOpen, setEditOrderDialogOpen] = useState(false)
  const [draggedLead, setDraggedLead] = useState<string | null>(null)
  const [editingListName, setEditingListName] = useState<string | null>(null)
  const [newListNameValue, setNewListNameValue] = useState("")

  // Determinar si el usuario puede "agarrar" leads
  const canClaimLeads = currentUserRole === "SELLER" || currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN"

  // Drag and drop de leads entre listas
  const handleDragStart = (leadId: string) => {
    setDraggedLead(leadId)
  }

  const handleDrop = async (targetListName: string) => {
    if (!draggedLead) return

    // Encontrar el lead
    const lead = leads.find((l) => l.id === draggedLead)
    if (!lead) {
      setDraggedLead(null)
      return
    }

    // No hacer nada si se suelta en la misma lista
    if (lead.list_name === targetListName) {
      setDraggedLead(null)
      return
    }

    // Actualizar list_name del lead (solo para Manychat - independiente de Trello)
    try {
      const response = await fetch(`/api/leads/${draggedLead}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_name: targetListName }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success(`Lead movido a "${targetListName}"`)
        if (onRefresh) {
          onRefresh()
        }
      } else {
        console.error("Error moviendo lead:", data.error)
        toast.error(data.error || "Error al mover lead")
      }
    } catch (error) {
      console.error("Error updating lead list:", error)
      toast.error("Error al mover lead")
    } finally {
      setDraggedLead(null)
    }
  }

  const handleCreateList = async (listName: string) => {
    try {
      const response = await fetch("/api/manychat/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId,
          listName,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success(`Lista "${listName}" creada correctamente`)
        // Recargar orden de listas
        fetchListOrder()
        if (onRefresh) {
          onRefresh()
        }
      } else {
        toast.error(data.error || "Error al crear lista")
      }
    } catch (error: any) {
      console.error("Error creating list:", error)
      toast.error("Error al crear lista")
    }
  }

  const handleSaveListName = async (oldListName: string) => {
    if (!newListNameValue.trim() || newListNameValue.trim() === oldListName) {
      setEditingListName(null)
      setNewListNameValue("")
      return
    }

    try {
      const response = await fetch("/api/manychat/lists", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId,
          oldListName,
          newListName: newListNameValue.trim(),
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success(`Lista renombrada a "${newListNameValue.trim()}"`)
        setEditingListName(null)
        setNewListNameValue("")
        // Recargar orden de listas
        fetchListOrder()
        if (onRefresh) {
          onRefresh()
        }
      } else {
        toast.error(data.error || "Error al renombrar lista")
      }
    } catch (error: any) {
      console.error("Error renaming list:", error)
      toast.error("Error al renombrar lista")
    }
  }

  const handleDeleteList = async (listName: string) => {
    try {
      const response = await fetch(`/api/manychat/lists?agencyId=${agencyId}&listName=${encodeURIComponent(listName)}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success(`Lista "${listName}" eliminada correctamente`)
        // Recargar orden de listas
        fetchListOrder()
        if (onRefresh) {
          onRefresh()
        }
      } else {
        toast.error(data.error || "Error al eliminar lista")
      }
    } catch (error: any) {
      console.error("Error deleting list:", error)
      toast.error("Error al eliminar lista")
    }
  }

  // Función para "agarrar" un lead
  const handleClaimLead = async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    
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

  // Función para cargar el orden de listas (reutilizable)
  const fetchListOrder = useCallback(async () => {
    try {
      const response = await fetch(`/api/manychat/list-order?agencyId=${agencyId}`)
      const data = await response.json()
      if (data.listNames && Array.isArray(data.listNames)) {
        // Mapear nombres de listas a ListInfo
        const listsInfo: ListInfo[] = data.listNames.map((name: string, index: number) => ({
          name: name,
          id: `manychat-${index}`, // ID temporal, no se usa pero lo necesitamos para el tipo
        }))
        setListOrder(listsInfo)
      } else {
        console.warn("⚠️ No se encontró orden de listas. Usando orden alfabético.")
        // Si no hay orden, usar orden alfabético como fallback
        setListOrder([])
      }
    } catch (error) {
      console.error("❌ Error fetching manychat list order:", error)
    } finally {
      setLoading(false)
    }
  }, [agencyId])

  // Obtener orden de listas desde manychat_list_order (INDEPENDIENTE de Trello)
  useEffect(() => {
    if (agencyId) {
      fetchListOrder()
    } else {
      console.error("❌ No hay agencyId para obtener orden de listas")
      setLoading(false)
    }
  }, [agencyId, fetchListOrder])

    // Agrupar leads por list_name (Manychat - independiente de Trello)
    const leadsByListName = useMemo(() => {
      const grouped: Record<string, Lead[]> = {}
      
      // Inicializar con todas las listas del orden guardado (para mantener el orden)
      listOrder.forEach(list => {
        grouped[list.name] = []
      })
      
      // Agrupar leads por list_name
      leads.forEach(lead => {
        if (lead.list_name) {
          const listName = lead.list_name.trim()
          if (!grouped[listName]) {
            grouped[listName] = []
          }
          grouped[listName].push(lead)
        }
      })
      
      return grouped
    }, [leads, listOrder])

  // Ordenar listas según el orden guardado en manychat_list_order
  // Si una lista no está en el orden guardado, agregarla al final
  const orderedListNames = useMemo(() => {
    const savedListNames = new Set(listOrder.map(l => l.name))
    const actualListNames = new Set(Object.keys(leadsByListName).filter(name => leadsByListName[name].length > 0))
    
    // Primero las listas guardadas en orden (solo las que tienen leads)
    const ordered: string[] = listOrder
      .map(l => l.name)
      .filter(name => actualListNames.has(name))
    
    // Luego las listas que no están en el orden guardado (agregadas al final)
    const additionalLists = Array.from(actualListNames).filter(name => !savedListNames.has(name))
    ordered.push(...additionalLists.sort()) // Orden alfabético para las nuevas
    
    return ordered
  }, [listOrder, leadsByListName])

  // Filtrar listas según el selector
  const filteredListNames = selectedListName === "ALL"
    ? orderedListNames
    : orderedListNames.filter(name => name === selectedListName)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Selector de lista y botones de gestión */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Label htmlFor="list-select" className="text-sm font-medium">
            Filtrar por lista:
          </Label>
          <Select value={selectedListName} onValueChange={setSelectedListName}>
            <SelectTrigger id="list-select" className="w-[200px]">
              <SelectValue placeholder="Todas las listas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las listas</SelectItem>
              {orderedListNames.map((listName) => (
                <SelectItem key={listName} value={listName}>
                  {listName} ({leadsByListName[listName]?.length || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {(currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN") && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newListName = prompt("Nombre de la nueva lista:")
                  if (newListName && newListName.trim()) {
                    handleCreateList(newListName.trim())
                  }
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nueva Lista
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOrderDialogOpen(true)}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Editar Orden
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {filteredListNames.map((listName) => {
          const listLeads = leadsByListName[listName] || []
          
          return (
            <div key={listName} className="flex-shrink-0 w-80">
              <Card className="h-full">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 flex-1">
                      {editingListName === listName ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={newListNameValue}
                            onChange={(e) => setNewListNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleSaveListName(listName)
                              } else if (e.key === "Escape") {
                                setEditingListName(null)
                                setNewListNameValue("")
                              }
                            }}
                            className="flex-1 px-2 py-1 text-sm border rounded"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            onClick={() => handleSaveListName(listName)}
                          >
                            Guardar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            onClick={() => {
                              setEditingListName(null)
                              setNewListNameValue("")
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <>
                          <h3 className="font-semibold text-sm">{listName}</h3>
                          {(currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN") && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingListName(listName)
                                  setNewListNameValue(listName)
                                }}
                                title="Editar nombre"
                              >
                                <Settings2 className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (confirm(`¿Eliminar la lista "${listName}"? Esto solo eliminará la lista si no tiene leads.`)) {
                                    handleDeleteList(listName)
                                  }
                                }}
                                title="Eliminar lista"
                              >
                                ×
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <Badge variant="secondary">{listLeads.length}</Badge>
                  </div>
                  
                  <ScrollArea className="h-[calc(100vh-250px)]">
                    <div
                      className="space-y-2"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        handleDrop(listName)
                      }}
                    >
                      {listLeads.length === 0 ? (
                        <div className="text-center text-muted-foreground text-sm py-8">
                          Sin leads
                        </div>
                      ) : (
                        listLeads.map((lead) => (
                          <Card
                            key={lead.id}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            draggable
                            onDragStart={() => handleDragStart(lead.id)}
                            onClick={() => {
                              if (!draggedLead) {
                                setSelectedLead(lead)
                                setDialogOpen(true)
                              }
                            }}
                          >
                            <CardContent className="p-3">
                              <div className="space-y-2">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="font-medium text-sm line-clamp-1">
                                      {lead.contact_name}
                                    </p>
                                    {lead.destination && (
                                      <p className="text-xs text-muted-foreground line-clamp-1">
                                        {lead.destination}
                                      </p>
                                    )}
                                  </div>
                                  {canClaimLeads && !lead.assigned_seller_id && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => handleClaimLead(lead.id, e)}
                                      disabled={claimingLeadId === lead.id}
                                      className="ml-2 h-6 w-6 p-0"
                                    >
                                      {claimingLeadId === lead.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <UserPlus className="h-3 w-3" />
                                      )}
                                    </Button>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                  {lead.contact_phone && (
                                    <Badge variant="outline" className="text-xs">
                                      📱 {lead.contact_phone}
                                    </Badge>
                                  )}
                                  {lead.contact_instagram && (
                                    <Badge variant="outline" className="text-xs">
                                      📷 @{lead.contact_instagram}
                                    </Badge>
                                  )}
                                </div>

                                {lead.region && (
                                  <div className="flex items-center gap-1">
                                    <div
                                      className={`w-2 h-2 rounded-full ${
                                        regionColors[lead.region] || "bg-gray-500"
                                      }`}
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {lead.region}
                                    </span>
                                  </div>
                                )}

                                {lead.assigned_seller_id && lead.users && (
                                  <div className="flex items-center gap-2 pt-1">
                                    <Avatar className="h-5 w-5">
                                      <AvatarFallback className="text-xs">
                                        {lead.users.name
                                          .split(" ")
                                          .map((n) => n[0])
                                          .join("")
                                          .toUpperCase()
                                          .slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs text-muted-foreground">
                                      {lead.users.name}
                                    </span>
                                  </div>
                                )}

                                {lead.has_deposit && (
                                  <div className="flex items-center gap-1 pt-1">
                                    <DollarSign className="h-3 w-3 text-green-600" />
                                    <span className="text-xs text-green-600 font-medium">
                                      Depósito: {lead.deposit_amount} {lead.deposit_currency}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )
        })}
      </div>

      {/* Dialog de detalle */}
      {selectedLead && (
        <LeadDetailDialog
          lead={selectedLead as any}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onDelete={onRefresh}
          onConvert={onRefresh}
          canClaimLeads={canClaimLeads}
          onClaim={onRefresh}
          agencies={agencies}
          sellers={sellers}
          operators={operators}
        />
      )}

      {/* Dialog de editar orden */}
      <EditListOrderDialog
        open={editOrderDialogOpen}
        onOpenChange={setEditOrderDialogOpen}
        agencyId={agencyId}
        currentListNames={orderedListNames}
        onSuccess={() => {
          // Recargar el orden de listas
          fetchListOrder()
          onRefresh?.()
        }}
      />
    </div>
  )
}

