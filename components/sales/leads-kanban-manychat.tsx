"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Phone, Instagram, MapPin, DollarSign, UserPlus, Loader2, Pencil, Trash2, Plus, GripVertical, Inbox, Check, X, User, Archive, ArchiveRestore, ListOrdered } from "lucide-react"
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

// Configuración de estilos por estado conocido; futuros estados heredan el fallback
const STATUS_CONFIG: Record<string, { label: string; activeClass: string }> = {
  NEW:         { label: "Nuevo",       activeClass: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700" },
  IN_PROGRESS: { label: "En Progreso", activeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700" },
  QUOTED:      { label: "Cotizado",    activeClass: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-700" },
  WON:         { label: "Ganado",      activeClass: "bg-success/15 text-success border-success/40" },
  LOST:        { label: "Perdido",     activeClass: "bg-destructive/15 text-destructive border-destructive/30" },
}
const STATUS_FALLBACK = { label: "", activeClass: "bg-primary/10 text-primary border-primary/30" }

// Colores de borde izquierdo por región
const regionBorderColors: Record<string, string> = {
  ARGENTINA: "border-l-accent-teal",
  CARIBE: "border-l-accent-teal",
  BRASIL: "border-l-success",
  EUROPA: "border-l-accent-violet",
  EEUU: "border-l-destructive",
  OTROS: "border-l-border",
  CRUCEROS: "border-l-primary",
}

const regionDotColors: Record<string, string> = {
  ARGENTINA: "bg-accent-teal",
  CARIBE: "bg-accent-teal",
  BRASIL: "bg-success",
  EUROPA: "bg-accent-violet",
  EEUU: "bg-destructive",
  OTROS: "bg-muted-foreground/30",
  CRUCEROS: "bg-primary",
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
  archived_at?: string | null
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
  /**
   * Feature flag per-tenant: muestra dropdown de filtro por Región.
   * Default false (preserva UI legacy). Pedido por LOZADA VIAJES
   * GUALEGUAYCHÚ 2026-05-21.
   */
  enableRegionFilter?: boolean
  /**
   * Feature flag per-tenant: al arrastrar un lead entre listas, infiere
   * status desde el nombre de la lista destino (keyword matching) y
   * lo actualiza junto con list_name. Default false (status independiente,
   * comportamiento legacy). Pedido por LOZADA VIAJES GUALEGUAYCHÚ.
   */
  enableListStatusSync?: boolean
  /**
   * Feature flag per-tenant: muestra dos inputs (desde / hasta) para
   * filtrar leads por fecha de creación. Pedido por Lozada 2026-05-22.
   * Default false (preserva UI legacy para otros tenants).
   */
  enableCreatedAtFilter?: boolean
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
  currentUserRole,
  enableRegionFilter = false,
  enableListStatusSync = false,
  enableCreatedAtFilter = false,
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
  const [viewMode, setViewMode] = useState<"activos" | "archivados">("activos")
  const [archivedLeads, setArchivedLeads] = useState<Lead[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL")
  // 2026-05-21 (Gualeguaychú): nuevo filtro opcional por Región.
  // Solo se renderea el dropdown si enableRegionFilter es true. El state
  // existe siempre para mantener hooks estables, pero si el flag está
  // off, "ALL" no aplica filtro alguno.
  const [selectedRegion, setSelectedRegion] = useState<string>("ALL")

  // 2026-05-22 (Lozada): filtro opcional por fecha de creación del lead.
  // States en formato "yyyy-MM-dd" (input type=date). Si el flag está off
  // o ambos vacíos, no se aplica filtro. La fecha del lead viene del
  // momento en que lo creó el webhook de Manychat (leads.created_at).
  const [createdAtFrom, setCreatedAtFrom] = useState<string>("")
  const [createdAtTo, setCreatedAtTo] = useState<string>("")

  // Estados presentes en los leads actuales (dinámico)
  const availableStatuses = useMemo(() => {
    const seen = new Set<string>()
    leads.forEach(l => { if (l.status) seen.add(l.status) })
    return Array.from(seen).sort()
  }, [leads])

  // Regiones presentes en los leads actuales (dinámico, sólo si flag prendido)
  const availableRegions = useMemo(() => {
    const seen = new Set<string>()
    leads.forEach((l) => { if (l.region) seen.add(l.region) })
    return Array.from(seen).sort()
  }, [leads])

  // Leads visibles según filtros (status + opcional region + opcional fecha)
  const visibleLeads = useMemo(() => {
    let out = leads
    if (selectedStatus !== "ALL") out = out.filter((l) => l.status === selectedStatus)
    if (enableRegionFilter && selectedRegion !== "ALL") {
      out = out.filter((l) => l.region === selectedRegion)
    }
    if (enableCreatedAtFilter && (createdAtFrom || createdAtTo)) {
      // created_at viene como ISO 8601 ("2026-05-22T13:45:00Z"). Comparamos
      // contra "yyyy-MM-dd" tomando solo los primeros 10 chars: zona horaria
      // del usuario es la del input. `to` es inclusivo (≤ ese día completo).
      out = out.filter((l) => {
        const d = (l.created_at || "").slice(0, 10)
        if (!d) return false
        if (createdAtFrom && d < createdAtFrom) return false
        if (createdAtTo && d > createdAtTo) return false
        return true
      })
    }
    return out
  }, [leads, selectedStatus, enableRegionFilter, selectedRegion, enableCreatedAtFilter, createdAtFrom, createdAtTo])

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

    // Feature flag per-tenant (organization_settings):
    // features.list_name_to_status_sync. Si está prendido, inferimos el
    // status desde el nombre de la lista destino (keyword matching) y lo
    // incluimos en el PATCH. Si la heurística no matchea ninguna keyword
    // o el status inferido coincide con el actual, no se envía status
    // (no-op silencioso). Pedido por LOZADA VIAJES GUALEGUAYCHÚ 2026-05-21.
    let inferredStatus: string | null = null
    if (enableListStatusSync) {
      const { inferStatusFromListName } = await import("@/lib/leads/infer-status-from-list")
      inferredStatus = inferStatusFromListName(targetListName)
      if (inferredStatus && inferredStatus !== lead.status) {
        patchBody.status = inferredStatus
      } else {
        inferredStatus = null // no se enviará — solo rollback de list_name si falla
      }
    }

    // Guardar estado previo para rollback
    const previousListName = lead.list_name
    const previousSellerId = lead.assigned_seller_id
    const previousStatus = lead.status
    const movedLeadId = draggedLead

    // OPTIMISTIC: Actualizar UI inmediatamente (updated_at fresco → sube al tope de la columna)
    onUpdateLead?.(movedLeadId, {
      list_name: targetListName,
      updated_at: new Date().toISOString(),
      ...(targetList?.seller_id ? { assigned_seller_id: targetList.seller_id } : {}),
      ...(inferredStatus ? { status: inferredStatus as any } : {}),
    })
    setDraggedLead(null)
    toast.success(
      inferredStatus
        ? `Lead movido a "${targetListName}" — estado: ${inferredStatus}`
        : `Lead movido a "${targetListName}"`
    )

    // API call en background
    try {
      const response = await fetch(`/api/leads/${movedLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      })
      if (!response.ok) {
        const data = await response.json()
        // Rollback completo (list + seller + status)
        onUpdateLead?.(movedLeadId, {
          list_name: previousListName,
          assigned_seller_id: previousSellerId,
          ...(inferredStatus ? { status: previousStatus as any } : {}),
        })
        toast.error(data.error || "Error al mover lead")
      }
    } catch (error) {
      // Rollback completo (incluye status si se había inferido)
      onUpdateLead?.(movedLeadId, {
        list_name: previousListName,
        assigned_seller_id: previousSellerId,
        ...(inferredStatus ? { status: previousStatus as any } : {}),
      })
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

  const fetchArchivedLeads = useCallback(async () => {
    if (!agencyId) return
    setLoadingArchived(true)
    try {
      const res = await fetch(`/api/leads?archived=true&agencyId=${agencyId}&limit=500`)
      const data = await res.json()
      setArchivedLeads(data.leads || [])
    } catch {
      setArchivedLeads([])
    } finally {
      setLoadingArchived(false)
    }
  }, [agencyId])

  useEffect(() => {
    if (viewMode === "archivados") fetchArchivedLeads()
  }, [viewMode, fetchArchivedLeads])

  const leadsByListName = useMemo(() => {
    const grouped: Record<string, Lead[]> = {}
    listOrder.forEach(list => { grouped[list.name] = [] })
    // Fix 2026-05-06 (CRM Ventas): match case-insensitive entre list_name
    // del lead y los nombres de columna del listOrder. ANTES los leads con
    // region="ARGENTINA" (uppercase) generaban una columna duplicada
    // separada de "Argentina" (capitalize del listOrder seed). Ahora si
    // un lead tiene region o list_name que matchea case-insensitive
    // con una columna existente, se agrega a esa columna. Si no hay
    // match, crea una columna nueva con el valor original del lead.
    const normalizeKey = (s: string) => s.trim().toLowerCase()
    visibleLeads.forEach(lead => {
      // Fallback: list_name (Manychat/Trello) → region (manuales) → "Sin lista"
      const rawName = (
        (lead.list_name && lead.list_name.trim()) ||
        ((lead as any).region && (lead as any).region.trim()) ||
        "Sin lista"
      )
      const normalized = normalizeKey(rawName)
      // Si ya existe una columna que matchea case-insensitive, usar ESA key
      // (preserva la version del listOrder seed). Sino crear nueva.
      const existingKey = Object.keys(grouped).find(
        (k) => normalizeKey(k) === normalized
      )
      const targetKey = existingKey || rawName
      if (!grouped[targetKey]) grouped[targetKey] = []
      grouped[targetKey].push(lead)
    })
    // Ordenar cada columna: el último movido queda primero
    Object.keys(grouped).forEach(listName => {
      grouped[listName].sort((a, b) => {
        const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return tb - ta
      })
    })
    return grouped
  }, [visibleLeads, listOrder])

  // Leads archivados agrupados por list_name (para la tab Archivados)
  const archivedLeadsByListName = useMemo(() => {
    const grouped: Record<string, Lead[]> = {}
    archivedLeads.forEach(lead => {
      const listName = (lead.list_name || "Sin lista").trim()
      if (!grouped[listName]) grouped[listName] = []
      grouped[listName].push(lead)
    })
    Object.keys(grouped).forEach(listName => {
      grouped[listName].sort((a, b) => {
        const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return tb - ta
      })
    })
    return grouped
  }, [archivedLeads])

  const orderedListNames = useMemo(() => {
    const savedListNames = new Set(listOrder.map(l => l.name))
    const ordered: string[] = listOrder.map(l => l.name)

    // Solo los admins ven listas "adicionales" (leads con list_name no registrado en manychat_list_order).
    // Los sellers SOLO ven sus propias listas + compartidas, tal como devuelve el servidor.
    // Esto evita que un seller vea columnas de otras vendedoras.
    if (isAdmin) {
      const actualListNames = new Set(Object.keys(leadsByListName).filter(name => leadsByListName[name].length > 0))
      const additionalLists = Array.from(actualListNames).filter(name => !savedListNames.has(name))
      ordered.push(...additionalLists.sort())
    }

    return ordered
  }, [listOrder, leadsByListName, isAdmin])

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
      {/* ── Tabs Activos / Archivados ── */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode("activos")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === "activos"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-white/60 dark:bg-card/60 text-muted-foreground hover:bg-white/80 dark:hover:bg-card/80"
          }`}
        >
          <Inbox className="h-4 w-4" />
          Activos
          <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${viewMode === "activos" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {leads.length}
          </span>
        </button>
        <button
          onClick={() => setViewMode("archivados")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === "archivados"
              ? "bg-accent-coral text-white shadow-sm"
              : "bg-white/60 dark:bg-card/60 text-muted-foreground hover:bg-white/80 dark:hover:bg-card/80"
          }`}
        >
          <Archive className="h-4 w-4" />
          Archivados
          {archivedLeads.length > 0 && (
            <span className={`ml-1 px-1.5 py-0.5 rounded text-xs ${viewMode === "archivados" ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>
              {archivedLeads.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Barra de filtros ── */}
      <div className="flex items-center justify-between gap-4 bg-white/60 dark:bg-card/60 backdrop-blur-sm rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Label htmlFor="list-select" className="text-sm font-medium text-muted-foreground">
            Filtrar:
          </Label>
          <Select value={selectedListName} onValueChange={setSelectedListName}>
            <SelectTrigger id="list-select" className="w-[220px] bg-white/80 dark:bg-card/80">
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
          {availableStatuses.length > 0 && (
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger id="status-select" className="w-[180px] bg-white/80 dark:bg-card/80">
                <SelectValue placeholder="Todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los estados</SelectItem>
                {availableStatuses.map((status) => {
                  const cfg = STATUS_CONFIG[status] ?? { ...STATUS_FALLBACK, label: status }
                  return (
                    <SelectItem key={status} value={status}>
                      {cfg.label || status}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          )}
          {/* Filtro por Región — opt-in per-tenant via organization_settings
              (features.region_filter_in_kanban). Pedido por LOZADA VIAJES
              GUALEGUAYCHÚ 2026-05-21: permite filtrar leads por destino
              regional (Caribe, Europa, etc.) para enfocarse en un mercado
              a la vez cuando hay muchos leads. */}
          {enableRegionFilter && availableRegions.length > 0 && (
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger id="region-select" className="w-[180px] bg-white/80 dark:bg-card/80">
                <SelectValue placeholder="Todas las regiones" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas las regiones</SelectItem>
                {availableRegions.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Filtro por fecha de creación — opt-in per-tenant via
              organization_settings (features.created_at_filter_in_kanban).
              Pedido por Lozada 2026-05-22: poder acotar leads viejos cuando
              el pipeline acumula. La fecha la setea el webhook de Manychat
              al insertar el lead (leads.created_at). */}
          {enableCreatedAtFilter && (
            <div className="flex items-center gap-1.5 bg-white/80 dark:bg-card/80 rounded-md px-2 py-1 border border-input">
              <Label htmlFor="created-at-from" className="text-xs text-muted-foreground whitespace-nowrap">
                Creado:
              </Label>
              <input
                id="created-at-from"
                type="date"
                value={createdAtFrom}
                onChange={(e) => setCreatedAtFrom(e.target.value)}
                max={createdAtTo || undefined}
                className="h-7 text-xs bg-transparent border-0 focus:outline-none text-foreground"
                aria-label="Fecha desde"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <input
                id="created-at-to"
                type="date"
                value={createdAtTo}
                onChange={(e) => setCreatedAtTo(e.target.value)}
                min={createdAtFrom || undefined}
                className="h-7 text-xs bg-transparent border-0 focus:outline-none text-foreground"
                aria-label="Fecha hasta"
              />
              {(createdAtFrom || createdAtTo) && (
                <button
                  type="button"
                  onClick={() => { setCreatedAtFrom(""); setCreatedAtTo("") }}
                  className="text-muted-foreground hover:text-foreground text-xs px-1"
                  aria-label="Limpiar filtro de fecha"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
        {canCreateLists && (
          <div className="flex items-center gap-2">
            {/* Bug fix 2026-05-06: el dialog EditListOrder estaba renderizado
                en el árbol pero no había NINGÚN trigger que llamara
                setEditOrderDialogOpen(true). Feature inalcanzable. Acá
                exponemos el botón al lado de "Nueva Lista" para que el
                user pueda reordenar las columnas del kanban. */}
            {orderedListNames.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="bg-white/80 dark:bg-card/80 hover:bg-white dark:hover:bg-card"
                onClick={() => setEditOrderDialogOpen(true)}
              >
                <ListOrdered className="mr-2 h-4 w-4" />
                Editar Orden
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="bg-white/80 dark:bg-card/80 hover:bg-white dark:hover:bg-card"
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

      {/* ── Board Archivados ── */}
      {viewMode === "archivados" && (
        <div>
          {loadingArchived ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
            </div>
          ) : archivedLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-muted-foreground gap-3">
              <Archive className="h-10 w-10 opacity-30" />
              <p className="text-sm">No hay leads archivados</p>
            </div>
          ) : (
            <div className="flex gap-5 overflow-x-auto pb-4">
              {Object.keys(archivedLeadsByListName).sort().map((listName) => {
                const listLeads = archivedLeadsByListName[listName]
                return (
                  <div key={listName} className="flex-shrink-0 w-80">
                    <div className="rounded-xl bg-accent-coral/10 backdrop-blur-sm shadow-sm border border-accent-coral/30">
                      {/* Header columna archivada */}
                      <div className="p-3 border-b border-accent-coral/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <Archive className="h-4 w-4 text-accent-coral shrink-0" />
                            <span className="font-semibold text-sm text-foreground truncate">{listName}</span>
                          </div>
                          <span className="text-xs text-accent-coral bg-accent-coral/15 px-2 py-0.5 rounded-full font-medium shrink-0 ml-2">
                            {listLeads.length}
                          </span>
                        </div>
                      </div>
                      {/* Cards archivadas */}
                      <div className="p-2 flex flex-col gap-2 max-h-[calc(100vh-320px)] overflow-y-auto">
                        {listLeads.map((lead) => (
                          <div
                            key={lead.id}
                            className="bg-white/70 dark:bg-card/70 rounded-lg p-3 shadow-sm cursor-pointer hover:shadow-md transition-all opacity-75 hover:opacity-100"
                            onClick={() => { setSelectedLead(lead); setDialogOpen(true) }}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="font-medium text-sm leading-tight truncate">{lead.contact_name}</p>
                              <Archive className="h-3 w-3 text-accent-coral shrink-0 mt-0.5" />
                            </div>
                            {lead.destination && (
                              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {lead.destination}
                              </p>
                            )}
                            {lead.contact_phone && (
                              <p className="text-xs text-muted-foreground truncate mt-1 flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" />
                                {lead.contact_phone}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Kanban Board (Activos) ── */}
      {viewMode === "activos" && (
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
                      bg-white/55 dark:bg-card/55 backdrop-blur-sm
                      ${isDragOver ? 'ring-2 ring-primary/50 bg-white/70 dark:bg-card/70 shadow-lg' : 'shadow-sm hover:shadow-md'}
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
                              className="flex-1 px-3 py-1.5 text-sm bg-white/90 dark:bg-card/90 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-success hover:text-success hover:bg-success/10" onClick={() => handleSaveListName(listName)}>
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
                                <div {...handleProps} className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded opacity-25 group-hover:opacity-70 hover:!opacity-100 transition-opacity" title="Arrastrar para reordenar columna">
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
                                  ${regionBorderColors[lead.region] || "border-l-border"}
                                  bg-white/90 dark:bg-card/90 backdrop-blur-sm
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
                                        <div className={`w-1.5 h-1.5 rounded-full ${regionDotColors[lead.region] || "bg-muted-foreground/30"}`} />
                                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{lead.region}</span>
                                      </div>
                                    )}
                                    {lead.has_deposit && (
                                      <span className="inline-flex items-center gap-1 bg-success/10 text-success rounded-full px-2 py-0.5 text-[10px] font-medium">
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
      )} {/* fin viewMode === "activos" */}

      {/* Dialog de detalle */}
      {selectedLead && (
        <LeadDetailDialog
          lead={selectedLead as any}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onDelete={onRefresh}
          onArchive={() => { onRefresh?.(); fetchArchivedLeads() }}
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
                placeholder="Ej: Cancún · Madero · Familias"
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
