"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Phone, Instagram, MapPin, DollarSign, UserPlus, Loader2, Pencil, Trash2, Plus, GripVertical, Inbox, Check, X, User } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { LeadDetailDialog } from "@/components/sales/lead-detail-dialog"
import { EditListOrderDialog } from "@/components/sales/edit-list-order-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// Colores de borde izquierdo por región
const regionBorderColors: Record<string, string> = {
  ARGENTINA: "border-l-blue-500",
  CARIBE: "border-l-cyan-500",
  BRASIL: "border-l-green-500",
  EUROPA: "border-l-purple-500",
  EEUU: "border-l-red-500",
  OTROS: "border-l-gray-400",
  CRUCEROS: "border-l-orange-500",
}

const regionDotColors: Record<string, string> = {
  ARGENTINA: "bg-blue-500",
  CARIBE: "bg-cyan-500",
  BRASIL: "bg-green-500",
  EUROPA: "bg-purple-500",
  EEUU: "bg-red-500",
  OTROS: "bg-gray-400",
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
  id: string
  seller_id: string | null
  seller_name: string | null
}

interface LeadsKanbanManychatProps {
  leads: Lead[]
  agencyId: string
  agencies?: Array<{ id: string; name: string }>
  sellers?: Array<{ id: string; name: string }>
  operators?: Array<{ id: string; name: string }>
  onRefresh?: () => void
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => void
  currentUserId?: string
  currentUserRole?: string
}

// Wrapper sortable para cada columna del Kanban
function SortableColumn({
  id,
  children,
  isAdmin,
  dragHandleProps,
}: {
  id: string
  children: (handleProps: any) => React.ReactNode
  isAdmin: boolean
  dragHandleProps?: any
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    scale: isDragging ? '0.98' : '1',
  }

  return (
    <div ref={setNodeRef} style={style} className="flex-shrink-0 w-80 transition-transform">
      {children(isAdmin ? { ...attributes, ...listeners } : null)}
    </div>
  )
}

export function LeadsKanbanManychat({
  leads,
  agencyId,
  agencies = [],
  sellers = [],
  operators = [],
  onRefresh,
  onUpdateLead,
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
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)
  const [editingListName, setEditingListName] = useState<string | null>(null)
  const [newListNameValue, setNewListNameValue] = useState("")
  const [columnOrder, setColumnOrder] = useState<string[]>([])
  const [createListDialogOpen, setCreateListDialogOpen] = useState(false)
  const [newListName, setNewListName] = useState("")
  const [newListSellerId, setNewListSellerId] = useState<string>("none")

  const isAdmin = currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN"
  const isSeller = currentUserRole === "SELLER"
  const canCreateLists = isAdmin || isSeller

  // Auto-scroll horizontal durante drag de cards
  const kanbanContainerRef = useRef<HTMLDivElement>(null)
  const scrollIntervalRef = useRef<number | null>(null)
  const isDraggingCardRef = useRef(false)

  const stopAutoScroll = () => {
    if (scrollIntervalRef.current !== null) {
      clearInterval(scrollIntervalRef.current)
      scrollIntervalRef.current = null
    }
  }

  // Listener permanente en document — usa ref síncrono para evitar
  // el problema de timing de React 18 con batched state updates
  useEffect(() => {
    const handleDragScroll = (e: DragEvent) => {
      if (!isDraggingCardRef.current) return
      const container = kanbanContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const threshold = 100
      if (e.clientX < rect.left + threshold) {
        if (scrollIntervalRef.current !== null) { clearInterval(scrollIntervalRef.current); scrollIntervalRef.current = null }
        scrollIntervalRef.current = window.setInterval(() => { kanbanContainerRef.current?.scrollBy({ left: -15 }) }, 16)
      } else if (e.clientX > rect.right - threshold) {
        if (scrollIntervalRef.current !== null) { clearInterval(scrollIntervalRef.current); scrollIntervalRef.current = null }
        scrollIntervalRef.current = window.setInterval(() => { kanbanContainerRef.current?.scrollBy({ left: 15 }) }, 16)
      } else {
        stopAutoScroll()
      }
    }
    document.addEventListener('dragover', handleDragScroll)
    return () => { document.removeEventListener('dragover', handleDragScroll) }
  }, [])

  // Sensors para drag de columnas
  const columnSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    })
  )

  const handleColumnDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = columnOrder.indexOf(active.id as string)
    const newIndex = columnOrder.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(columnOrder, oldIndex, newIndex)
    setColumnOrder(newOrder)

    try {
      const response = await fetch("/api/manychat/list-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, listNames: newOrder }),
      })
      if (!response.ok) throw new Error("Error al guardar orden")
      toast.success("Orden actualizado")
    } catch (error) {
      console.error("Error saving column order:", error)
      toast.error("Error al guardar el orden")
      setColumnOrder(arrayMove(newOrder, newIndex, oldIndex))
    }
  }, [columnOrder, agencyId])

  const canClaimLeads = currentUserRole === "SELLER" || currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN"

  const handleDragStart = (leadId: string, e: React.DragEvent) => {
    isDraggingCardRef.current = true  // síncrono: disponible antes del primer dragover
    setDraggedLead(leadId)
    // Mejorar visual del drag: hacer el fantasma semitransparente
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move"
      // Usar el elemento como drag image con offset centrado
      const target = e.currentTarget as HTMLElement
      if (target) {
        e.dataTransfer.setDragImage(target, target.offsetWidth / 2, 20)
      }
    }
  }

  const handleDrop = async (targetListName: string) => {
    isDraggingCardRef.current = false
    stopAutoScroll()
    setDragOverColumn(null)
    if (!draggedLead) return

    const lead = leads.find((l) => l.id === draggedLead)
    if (!lead) { setDraggedLead(null); return }
    if (lead.list_name === targetListName) { setDraggedLead(null); return }

    // Si la lista destino tiene seller, auto-asignar
    const targetList = listOrder.find(l => l.name === targetListName)
    const patchBody: any = { list_name: targetListName }
    if (targetList?.seller_id) {
      patchBody.assigned_seller_id = targetList.seller_id
    }

    // Guardar estado previo para rollback
    const previousListName = lead.list_name
    const previousSellerId = lead.assigned_seller_id
    const movedLeadId = draggedLead

    // OPTIMISTIC: Actualizar UI inmediatamente
    onUpdateLead?.(movedLeadId, {
      list_name: targetListName,
      ...(targetList?.seller_id ? { assigned_seller_id: targetList.seller_id } : {}),
    })
    setDraggedLead(null)
    toast.success(`Lead movido a "${targetListName}"`)

    // API call en background
    try {
      const response = await fetch(`/api/leads/${movedLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      })
      if (!response.ok) {
        const data = await response.json()
        // Rollback
        onUpdateLead?.(movedLeadId, { list_name: previousListName, assigned_seller_id: previousSellerId })
        toast.error(data.error || "Error al mover lead")
      }
    } catch (error) {
      // Rollback
      onUpdateLead?.(movedLeadId, { list_name: previousListName, assigned_seller_id: previousSellerId })
      toast.error("Error al mover lead")
    }
  }

  const handleCreateList = async (listName: string, sellerId?: string) => {
    try {
      const response = await fetch("/api/manychat/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyId,
          listName,
          sellerId: sellerId && sellerId !== "none" ? sellerId : undefined,
        }),
      })
      const data = await response.json()
      if (response.ok && data.success) {
        toast.success(`Lista "${listName}" creada`)
        fetchListOrder()
      } else {
        toast.error(data.error || "Error al crear lista")
      }
    } catch (error) {
      toast.error("Error al crear lista")
    }
  }

  const handleSubmitCreateList = () => {
    if (!newListName.trim()) {
      toast.error("Ingrese un nombre para la lista")
      return
    }
    const sellerId = isSeller ? currentUserId : (newListSellerId !== "none" ? newListSellerId : undefined)
    handleCreateList(newListName.trim(), sellerId)
    setCreateListDialogOpen(false)
    setNewListName("")
    setNewListSellerId("none")
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
        body: JSON.stringify({ agencyId, oldListName, newListName: newListNameValue.trim() }),
      })
      const data = await response.json()
      if (response.ok && data.success) {
        toast.success(`Lista renombrada a "${newListNameValue.trim()}"`)
        setEditingListName(null)
        setNewListNameValue("")
        fetchListOrder()
        // Actualizar leads localmente que tenían ese list_name
        leads.forEach(lead => {
          if (lead.list_name === oldListName) {
            onUpdateLead?.(lead.id, { list_name: newListNameValue.trim() })
          }
        })
      } else {
        toast.error(data.error || "Error al renombrar lista")
      }
    } catch (error) {
      toast.error("Error al renombrar lista")
    }
  }

  const handleDeleteList = async (listName: string) => {
    try {
      const response = await fetch(`/api/manychat/lists?agencyId=${agencyId}&listName=${encodeURIComponent(listName)}`, { method: "DELETE" })
      const data = await response.json()
      if (response.ok && data.success) {
        toast.success(`Lista "${listName}" eliminada`)
        fetchListOrder()
      } else {
        toast.error(data.error || "Error al eliminar lista")
      }
    } catch (error) {
      toast.error("Error al eliminar lista")
    }
  }

  const handleClaimLead = async (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setClaimingLeadId(leadId)

    // Buscar la lista personal del vendedor actual
    const sellerList = listOrder.find(l => l.seller_id === currentUserId)
    const currentLead = leads.find(l => l.id === leadId)
    const previousListName = currentLead?.list_name || null

    // OPTIMISTIC: Asignar inmediatamente en la UI y mover a la lista del vendedor
    if (currentUserId) {
      const sellerName = sellers.find(s => s.id === currentUserId)?.name || "Tú"
      const updates: Partial<Lead> = {
        assigned_seller_id: currentUserId,
        users: { name: sellerName, email: "" },
      }
      if (sellerList) {
        updates.list_name = sellerList.name
      }
      onUpdateLead?.(leadId, updates)
    }

    try {
      const response = await fetch("/api/leads/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      })
      const data = await response.json()
      if (!response.ok) {
        // Rollback
        onUpdateLead?.(leadId, { assigned_seller_id: null, users: null, list_name: previousListName })
        toast.error(data.error || "Error al agarrar el lead")
        return
      }
      toast.success(data.message || "Lead asignado!")
      if (data.warning) toast.warning(data.warning, { duration: 5000 })
    } catch (error) {
      // Rollback
      onUpdateLead?.(leadId, { assigned_seller_id: null, users: null, list_name: previousListName })
      toast.error("Error al agarrar el lead")
    } finally {
      setClaimingLeadId(null)
    }
  }

  const fetchListOrder = useCallback(async () => {
    try {
      const response = await fetch(`/api/manychat/list-order?agencyId=${agencyId}`)
      const data = await response.json()
      if (data.order && Array.isArray(data.order)) {
        const listsInfo: ListInfo[] = data.order.map((item: any, index: number) => ({
          name: item.list_name,
          id: `manychat-${index}`,
          seller_id: item.seller_id || null,
          seller_name: item.seller_name || null,
        }))
        setListOrder(listsInfo)
      } else if (data.listNames && Array.isArray(data.listNames)) {
        const listsInfo: ListInfo[] = data.listNames.map((name: string, index: number) => ({
          name, id: `manychat-${index}`,
          seller_id: null,
          seller_name: null,
        }))
        setListOrder(listsInfo)
      } else {
        setListOrder([])
      }
    } catch (error) {
      console.error("Error fetching manychat list order:", error)
    } finally {
      setLoading(false)
    }
  }, [agencyId])

  useEffect(() => {
    if (agencyId) fetchListOrder()
    else setLoading(false)
  }, [agencyId, fetchListOrder])

  const leadsByListName = useMemo(() => {
    const grouped: Record<string, Lead[]> = {}
    listOrder.forEach(list => { grouped[list.name] = [] })
    leads.forEach(lead => {
      if (lead.list_name) {
        const listName = lead.list_name.trim()
        if (!grouped[listName]) grouped[listName] = []
        grouped[listName].push(lead)
      }
    })
    return grouped
  }, [leads, listOrder])

  const orderedListNames = useMemo(() => {
    const savedListNames = new Set(listOrder.map(l => l.name))
    const actualListNames = new Set(Object.keys(leadsByListName).filter(name => leadsByListName[name].length > 0))
    const ordered: string[] = listOrder.map(l => l.name)
    const additionalLists = Array.from(actualListNames).filter(name => !savedListNames.has(name))
    ordered.push(...additionalLists.sort())
    return ordered
  }, [listOrder, leadsByListName])

  useEffect(() => { setColumnOrder(orderedListNames) }, [orderedListNames])

  const displayListNames = columnOrder.length > 0 ? columnOrder : orderedListNames
  const filteredListNames = selectedListName === "ALL"
    ? displayListNames
    : displayListNames.filter(name => name === selectedListName)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Barra de filtros ── */}
      <div className="flex items-center justify-between gap-4 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Label htmlFor="list-select" className="text-sm font-medium text-muted-foreground">
            Filtrar:
          </Label>
          <Select value={selectedListName} onValueChange={setSelectedListName}>
            <SelectTrigger id="list-select" className="w-[220px] bg-white/80 dark:bg-gray-800/80">
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
        {canCreateLists && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-800"
              onClick={() => {
                setNewListName("")
                setNewListSellerId(isSeller && currentUserId ? currentUserId : "none")
                setCreateListDialogOpen(true)
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nueva Lista
            </Button>
          </div>
        )}
      </div>

      {/* ── Kanban Board ── */}
      <DndContext sensors={columnSensors} collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd}>
        <SortableContext items={filteredListNames} strategy={horizontalListSortingStrategy}>
          <div ref={kanbanContainerRef} className="flex gap-5 overflow-x-auto pb-4">
            {filteredListNames.map((listName) => {
              const listLeads = leadsByListName[listName] || []
              const isDragOver = dragOverColumn === listName

              return (
                <SortableColumn key={listName} id={listName} isAdmin={isAdmin}>
                  {(handleProps: any) => (
                    <div className={`
                      group rounded-xl transition-all duration-200
                      bg-white/55 dark:bg-gray-900/55 backdrop-blur-sm
                      ${isDragOver ? 'ring-2 ring-primary/50 bg-white/70 dark:bg-gray-900/70 shadow-lg' : 'shadow-sm hover:shadow-md'}
                    `}>
                      {/* ── Header de columna ── */}
                      <div className="p-4 pb-3">
                        {editingListName === listName ? (
                          /* Modo edición */
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newListNameValue}
                              onChange={(e) => setNewListNameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveListName(listName)
                                else if (e.key === "Escape") { setEditingListName(null); setNewListNameValue("") }
                              }}
                              className="flex-1 px-3 py-1.5 text-sm bg-white/90 dark:bg-gray-800/90 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleSaveListName(listName)}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted/50" onClick={() => { setEditingListName(null); setNewListNameValue("") }}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          /* Modo normal */
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {/* Drag handle integrado en el header */}
                              {isAdmin && handleProps && (
                                <div {...handleProps} className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity" title="Arrastrar columna">
                                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex flex-col min-w-0">
                                <h3 className="font-semibold text-sm truncate">{listName}</h3>
                                {(() => {
                                  const listInfo = listOrder.find(l => l.name === listName)
                                  if (listInfo?.seller_name) {
                                    return (
                                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                                        <User className="h-2.5 w-2.5" />
                                        {listInfo.seller_name}
                                      </span>
                                    )
                                  }
                                  return null
                                })()}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {/* Controls — aparecen en hover (admin = todas, seller = solo las suyas) */}
                              {(() => {
                                const listInfo = listOrder.find(l => l.name === listName)
                                const canEditThisList = isAdmin || (isSeller && listInfo?.seller_id === currentUserId)
                                if (!canEditThisList) return null
                                return (
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                      variant="ghost" size="sm"
                                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                      onClick={(e) => { e.stopPropagation(); setEditingListName(listName); setNewListNameValue(listName) }}
                                      title="Editar nombre"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="sm"
                                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (confirm(`¿Eliminar la lista "${listName}"?`)) handleDeleteList(listName)
                                      }}
                                      title="Eliminar lista"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )
                              })()}
                              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                                {listLeads.length}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ── Área de leads ── */}
                      <ScrollArea className="h-[calc(100vh-300px)]">
                        <div
                          className={`px-3 pb-3 space-y-2.5 min-h-[200px] transition-colors duration-150 rounded-b-xl ${
                            isDragOver ? "bg-primary/5 ring-2 ring-inset ring-primary/20" : ""
                          }`}
                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverColumn(listName) }}
                          onDragLeave={(e) => {
                            // Solo resetear si realmente salimos del contenedor
                            const rect = e.currentTarget.getBoundingClientRect()
                            const { clientX, clientY } = e
                            if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
                              setDragOverColumn(null)
                            }
                          }}
                          onDrop={(e) => { e.preventDefault(); handleDrop(listName) }}
                        >
                          {listLeads.length === 0 ? (
                            /* Estado vacío */
                            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
                              <Inbox className="h-8 w-8 mb-2" />
                              <span className="text-xs">Sin leads</span>
                            </div>
                          ) : (
                            listLeads.map((lead) => (
                              /* ── Lead Card ── */
                              <div
                                key={lead.id}
                                draggable
                                onDragStart={(e) => handleDragStart(lead.id, e)}
                                onDragEnd={() => { isDraggingCardRef.current = false; stopAutoScroll(); setDraggedLead(null); setDragOverColumn(null) }}
                                onClick={() => { if (!draggedLead) { setSelectedLead(lead); setDialogOpen(true) } }}
                                className={`
                                  cursor-grab active:cursor-grabbing rounded-xl border-l-4
                                  ${regionBorderColors[lead.region] || "border-l-gray-300"}
                                  bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm
                                  shadow-sm hover:shadow-lg hover:-translate-y-0.5
                                  transition-all duration-200 p-3.5
                                  ${draggedLead === lead.id ? "opacity-40 scale-95 shadow-none" : ""}
                                `}
                              >
                                {/* Nombre + Claim button */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm truncate">{lead.contact_name}</p>
                                    {lead.destination && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <MapPin className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
                                        <p className="text-xs text-muted-foreground truncate">{lead.destination}</p>
                                      </div>
                                    )}
                                  </div>
                                  {canClaimLeads && !lead.assigned_seller_id && (
                                    <Button
                                      size="sm" variant="ghost"
                                      onClick={(e) => handleClaimLead(lead.id, e)}
                                      disabled={claimingLeadId === lead.id}
                                      className="h-7 w-7 p-0 rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex-shrink-0"
                                    >
                                      {claimingLeadId === lead.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <UserPlus className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  )}
                                </div>

                                {/* Contacto */}
                                <div className="flex items-center gap-3 mt-2.5 text-muted-foreground">
                                  {lead.contact_phone && (
                                    <div className="flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      <span className="text-xs truncate max-w-[100px]">{lead.contact_phone}</span>
                                    </div>
                                  )}
                                  {lead.contact_instagram && (
                                    <div className="flex items-center gap-1">
                                      <Instagram className="h-3 w-3" />
                                      <span className="text-xs truncate max-w-[80px]">@{lead.contact_instagram}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Footer: region + seller + deposit */}
                                <div className="flex items-center justify-between mt-2.5">
                                  <div className="flex items-center gap-2">
                                    {lead.region && (
                                      <div className="flex items-center gap-1">
                                        <div className={`w-1.5 h-1.5 rounded-full ${regionDotColors[lead.region] || "bg-gray-400"}`} />
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{lead.region}</span>
                                      </div>
                                    )}
                                    {lead.has_deposit && (
                                      <span className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full px-2 py-0.5 text-[10px] font-medium">
                                        <DollarSign className="h-2.5 w-2.5" />
                                        {lead.deposit_amount} {lead.deposit_currency}
                                      </span>
                                    )}
                                  </div>

                                  {lead.assigned_seller_id && lead.users && (
                                    <Avatar className="h-5 w-5 ring-2 ring-primary/20">
                                      <AvatarFallback className="text-[9px] font-medium bg-primary/10 text-primary">
                                        {lead.users.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </SortableColumn>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Dialog de detalle */}
      {selectedLead && (
        <LeadDetailDialog
          lead={selectedLead as any}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onDelete={onRefresh}
          onConvert={onRefresh}
          canClaimLeads={canClaimLeads}
          onClaim={() => {
            if (currentUserId) {
              const sellerName = sellers.find(s => s.id === currentUserId)?.name || "Tú"
              onUpdateLead?.(selectedLead.id, { assigned_seller_id: currentUserId, users: { name: sellerName, email: "" } })
            }
          }}
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
        onSuccess={() => { fetchListOrder(); onRefresh?.() }}
      />

      {/* Dialog de crear lista con vendedor */}
      <Dialog open={createListDialogOpen} onOpenChange={setCreateListDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Nueva Lista</DialogTitle>
            <DialogDescription>
              Crea una nueva lista para el Kanban{isSeller ? "" : ". Opcionalmente asígnala a un vendedor."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-list-name">Nombre de la lista</Label>
              <Input
                id="new-list-name"
                placeholder="Ej: Leads - Santiago"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmitCreateList() }}
                autoFocus
              />
            </div>
            {isAdmin && sellers.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="new-list-seller">Vendedor (opcional)</Label>
                <Select value={newListSellerId} onValueChange={setNewListSellerId}>
                  <SelectTrigger id="new-list-seller">
                    <SelectValue placeholder="Sin asignar (compartida)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar (compartida)</SelectItem>
                    {sellers.map((seller) => (
                      <SelectItem key={seller.id} value={seller.id}>
                        {seller.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Si asignas un vendedor, solo ese vendedor verá esta lista.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateListDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitCreateList} disabled={!newListName.trim()}>
              Crear Lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
