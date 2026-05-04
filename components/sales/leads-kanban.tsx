"use client"

import { useState, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExternalLink, DollarSign, UserPlus, Loader2, MapPin, Phone, Instagram } from "lucide-react"
import Link from "next/link"
import { LeadDetailDialog } from "@/components/sales/lead-detail-dialog"
import { toast } from "sonner"

const statusColumns = [
  { id: "NEW", label: "Nuevo", color: "bg-primary/10" },
  { id: "IN_PROGRESS", label: "En Progreso", color: "bg-primary/15" },
  { id: "QUOTED", label: "Cotizado", color: "bg-accent-coral/10" },
  { id: "WON", label: "Ganado", color: "bg-success/10" },
  { id: "LOST", label: "Perdido", color: "bg-destructive/10" },
]

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
  trello_url: string | null
  trello_list_id?: string | null
  created_at?: string
  notes?: string | null
  assigned_seller_id: string | null
  has_deposit?: boolean
  deposit_amount?: number | null
  deposit_currency?: string | null
  users?: { name: string; email: string } | null
  agencies?: { name: string } | null
}

interface LeadsKanbanProps {
  leads: Lead[]
  agencies?: Array<{ id: string; name: string }>
  sellers?: Array<{ id: string; name: string }>
  operators?: Array<{ id: string; name: string }>
  onRefresh?: () => void
  currentUserId?: string
  currentUserRole?: string
  initialLeadId?: string | null
}

export function LeadsKanban({ leads, agencies = [], sellers = [], operators = [], onRefresh, currentUserId, currentUserRole, initialLeadId }: LeadsKanbanProps) {
  const [draggedLead, setDraggedLead] = useState<string | null>(null)
  const [claimingLeadId, setClaimingLeadId] = useState<string | null>(null)

  // Auto-scroll horizontal durante drag
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollIntervalRef = useRef<number | null>(null)
  const isDraggingRef = useRef(false) // ref síncrono, no depende del ciclo de render de React

  const stopAutoScroll = () => {
    if (scrollIntervalRef.current !== null) {
      clearInterval(scrollIntervalRef.current)
      scrollIntervalRef.current = null
    }
  }

  // Listener permanente — se monta una vez y usa el ref para saber si hay drag activo.
  // Esto evita el bug de timing de React 18 donde el state update es asíncrono
  // y el useEffect no agrega el listener a tiempo para los primeros dragover events.
  useEffect(() => {
    const handleDragScroll = (e: DragEvent) => {
      if (!isDraggingRef.current) return
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const threshold = 100

      if (e.clientX < rect.left + threshold) {
        if (scrollIntervalRef.current !== null) {
          clearInterval(scrollIntervalRef.current)
          scrollIntervalRef.current = null
        }
        scrollIntervalRef.current = window.setInterval(() => {
          containerRef.current?.scrollBy({ left: -15 })
        }, 16)
      } else if (e.clientX > rect.right - threshold) {
        if (scrollIntervalRef.current !== null) {
          clearInterval(scrollIntervalRef.current)
          scrollIntervalRef.current = null
        }
        scrollIntervalRef.current = window.setInterval(() => {
          containerRef.current?.scrollBy({ left: 15 })
        }, 16)
      } else {
        stopAutoScroll()
      }
    }

    document.addEventListener('dragover', handleDragScroll)
    return () => {
      document.removeEventListener('dragover', handleDragScroll)
    }
  }, []) // solo se monta una vez al montar el componente

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

  // Determinar si el usuario puede "agarrar" leads
  // Vendedores pueden agarrar, Admins también pueden (para asignarse o reasignar)
  const canClaimLeads = currentUserRole === "SELLER" || currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN"
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Abrir dialog automáticamente si hay initialLeadId
  useEffect(() => {
    if (initialLeadId && leads.length > 0) {
      const lead = leads.find(l => l.id === initialLeadId)
      if (lead) {
        setSelectedLead(lead)
        setDialogOpen(true)
      }
    }
  }, [initialLeadId, leads])

  const leadsByStatus = statusColumns.reduce((acc, col) => {
    acc[col.id] = leads.filter((lead) => lead.status === col.id)
    return acc
  }, {} as Record<string, Lead[]>)

  const handleDragStart = (leadId: string) => {
    isDraggingRef.current = true  // síncrono: disponible antes del primer dragover
    setDraggedLead(leadId)
  }

  const handleDrop = async (newStatus: string) => {
    if (!draggedLead) return
    isDraggingRef.current = false
    stopAutoScroll()

    try {
      await fetch("/api/leads/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: draggedLead, status: newStatus }),
      })
      window.location.reload()
    } catch (error) {
      console.error("Error updating status:", error)
    } finally {
      setDraggedLead(null)
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex gap-5 overflow-x-auto pb-4"
      onDragEnd={() => {
        isDraggingRef.current = false
        stopAutoScroll()
      }}
    >
      {statusColumns.map((column) => (
        <div key={column.id} className="flex-shrink-0 w-80">
          <div className="rounded-xl bg-white/55 dark:bg-card/55 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
            {/* Header */}
            <div className="p-4 pb-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{column.label}</h3>
                <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                  {leadsByStatus[column.id]?.length || 0}
                </span>
              </div>
            </div>

            {/* Cards */}
            <ScrollArea className="h-[calc(100vh-300px)]">
              <div
                className="px-3 pb-3 space-y-2.5 min-h-[200px]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  handleDrop(column.id)
                }}
              >
                {(leadsByStatus[column.id]?.length || 0) === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50">
                    <span className="text-xs">Sin leads</span>
                  </div>
                ) : (
                  leadsByStatus[column.id]?.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => handleDragStart(lead.id)}
                      onClick={() => {
                        if (!draggedLead) {
                          setSelectedLead(lead)
                          setDialogOpen(true)
                        }
                      }}
                      className={`
                        cursor-grab active:cursor-grabbing rounded-xl border-l-4
                        ${regionBorderColors[lead.region] || "border-l-border"}
                        bg-white/90 dark:bg-card/90 backdrop-blur-sm
                        shadow-sm hover:shadow-lg hover:-translate-y-0.5
                        transition-all duration-200 p-3.5
                        ${draggedLead === lead.id ? "opacity-40 scale-95 shadow-none" : ""}
                      `}
                    >
                      {/* Name + Trello link */}
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
                        {lead.trello_url && (
                          <a
                            href={lead.trello_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
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

                      {/* Contact */}
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
                          {lead.has_deposit && lead.deposit_amount && (
                            <span className="inline-flex items-center gap-1 bg-success/10 text-success rounded-full px-2 py-0.5 text-[10px] font-medium">
                              <DollarSign className="h-2.5 w-2.5" />
                              {lead.deposit_amount} {lead.deposit_currency || "ARS"}
                            </span>
                          )}
                        </div>

                        {lead.assigned_seller_id && lead.users && (
                          <Avatar className="h-5 w-5 ring-2 ring-primary/20">
                            <AvatarFallback className="text-[9px] font-medium bg-primary/10 text-primary">
                              {(lead.users.name || "").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
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
        </div>
      ))}

      {selectedLead && (
        <LeadDetailDialog
          lead={selectedLead as any}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          agencies={agencies}
          sellers={sellers}
          operators={operators}
          onDelete={onRefresh}
          onConvert={onRefresh}
          canClaimLeads={canClaimLeads}
          onClaim={onRefresh}
        />
      )}
    </div>
  )
}

