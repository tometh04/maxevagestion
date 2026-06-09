"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ExternalLink, MapPin, Users, Phone, Mail, Instagram, Calendar, FileText, Edit, Trash2, ArrowRight, AlertTriangle, UserPlus, Loader2, CheckCircle2, User, Briefcase, Save, X, MessageSquare, Send, Archive, ArchiveRestore, ClipboardList, Clock, DollarSign, Eye, Download } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import dynamic from "next/dynamic"
import { ConvertLeadDialog } from "@/components/sales/convert-lead-dialog"
// Lazy load: quotation-builder-dialog pesa ~1900 líneas y solo se abre al
// generar cotización (fracción de las veces que se abre un lead).
const QuotationBuilderDialog = dynamic(
  () =>
    import("@/components/sales/quotation-builder-dialog").then((m) => ({
      default: m.QuotationBuilderDialog,
    })),
  { ssr: false }
)
import { EditLeadDialog } from "@/components/sales/edit-lead-dialog"
import { LeadDocumentsSection } from "@/components/sales/lead-documents-section"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { getQuotationOptionPricing } from "@/lib/quotations/presentation"
import { getPublicQuotationPdfPath } from "@/lib/quotations/public-links"
import { QuotationPdfPriceDialog } from "@/components/sales/quotation-pdf-price-dialog"
import { LeadEmiliaChat } from "@/components/sales/lead-emilia-chat"

const regionColors: Record<string, string> = {
  ARGENTINA: "bg-accent-coral/80",
  CARIBE: "bg-accent-coral/70",
  BRASIL: "bg-accent-coral/60",
  EUROPA: "bg-accent-coral/50",
  EEUU: "bg-accent-coral/40",
  OTROS: "bg-accent-coral/90",
  CRUCEROS: "bg-accent-coral/30",
}

const statusLabels: Record<string, string> = {
  NEW: "Nuevo",
  IN_PROGRESS: "En Progreso",
  QUOTED: "Cotizado",
  WON: "Ganado",
  LOST: "Perdido",
}

/**
 * Componente que procesa el texto y convierte números de teléfono en enlaces de WhatsApp
 */
function DescriptionWithLinks({ text }: { text: string }) {
  // Regex para detectar números de teléfono (formato argentino común: 10 dígitos, puede tener espacios, guiones, paréntesis)
  // También detecta números que vengan después de "WhatsApp:", "📱", "WhatsApp", etc.
  const phoneRegex = /(?:whatsapp|📱|wa\.me)[:\s]*([\d\s\-\(\)\+]+)/gi
  
  // Función para limpiar y formatear el número de teléfono
  const formatPhoneNumber = (phone: string): string => {
    // Remover espacios, guiones, paréntesis
    let cleaned = phone.replace(/[\s\-\(\)]/g, "")
    
    // Si empieza con +54, removerlo (wa.me ya incluye el código de país)
    if (cleaned.startsWith("+54")) {
      cleaned = cleaned.substring(3)
    }
    // Si empieza con 54, removerlo
    if (cleaned.startsWith("54")) {
      cleaned = cleaned.substring(2)
    }
    
    // Si empieza con 9, removerlo (código de acceso internacional)
    if (cleaned.startsWith("9")) {
      cleaned = cleaned.substring(1)
    }
    
    return cleaned
  }
  
  // Función para crear el enlace de WhatsApp
  const createWhatsAppLink = (phone: string): string => {
    const formatted = formatPhoneNumber(phone)
    return `https://wa.me/549${formatted}`
  }
  
  // Procesar el texto y convertir números en enlaces
  const processText = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match
    
    // Resetear el regex
    phoneRegex.lastIndex = 0
    
    while ((match = phoneRegex.exec(text)) !== null) {
      // Agregar texto antes del match
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index))
      }
      
      // Extraer el número de teléfono
      const phoneNumber = match[1].trim()
      const formattedPhone = formatPhoneNumber(phoneNumber)
      
      // Solo crear enlace si el número tiene al menos 8 dígitos
      if (formattedPhone.length >= 8) {
        const whatsappLink = createWhatsAppLink(phoneNumber)
        parts.push(
          <a
            key={`whatsapp-${match.index}`}
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium"
          >
            {match[0]}
          </a>
        )
      } else {
        // Si no es un número válido, mantener el texto original
        parts.push(match[0])
      }
      
      lastIndex = match.index + match[0].length
    }
    
    // Agregar el resto del texto
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex))
    }
    
    return parts.length > 0 ? parts : [text]
  }
  
  return <p className="text-sm whitespace-pre-wrap">{processText(text)}</p>
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
  trello_full_data?: Record<string, any> | null
  assigned_seller_id: string | null
  agency_id?: string
  created_at: string
  updated_at?: string
  notes: string | null
  quoted_price?: number | null
  has_deposit?: boolean
  deposit_amount?: number | null
  deposit_currency?: string | null
  deposit_method?: string | null
  deposit_date?: string | null
  users?: { name: string; email: string } | null
  agencies?: { name: string } | null
  // Enlaces a entidades convertidas
  operations?: Array<{ 
    id: string
    file_code?: string
    destination: string
    status: string
    created_at?: string
    departure_date?: string
    sale_amount_total?: number
  }> | null
  customers?: Array<{ id: string; first_name: string; last_name: string }> | null
  archived_at?: string | null
}

interface LeadDetailDialogProps {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  agencies?: Array<{ id: string; name: string }>
  sellers?: Array<{ id: string; name: string }>
  operators?: Array<{ id: string; name: string; admin_fee_percentage?: number | null }>
  onEdit?: (lead: Lead) => void
  onDelete?: () => void
  onArchive?: () => void
  onConvert?: () => void
  canClaimLeads?: boolean
  onClaim?: () => void
  /**
   * Sección extra opcional que se renderiza dentro del dialog, encima de
   * "Notas". Pensado para que los tenants en crm_mode='advanced' (VICO)
   * puedan inyectar la UI de tags/funnels custom sin tocar este dialog.
   *
   * Si la prop NO se pasa (default Lozada y cualquier tenant legacy), el
   * dialog se ve exactamente igual que antes. Cualquier change visual del
   * dialog en Lozada es un BUG.
   */
  tagsSection?: React.ReactNode
}

export function LeadDetailDialog({
  lead,
  open,
  onOpenChange,
  agencies = [],
  sellers = [],
  operators = [],
  onEdit,
  onDelete,
  onArchive,
  onConvert,
  canClaimLeads = false,
  onClaim,
  tagsSection,
}: LeadDetailDialogProps) {
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false)
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null)
  // Cotización con el dialog "Cambiar precio" abierto antes de generar el PDF
  const [pdfPriceQuotation, setPdfPriceQuotation] = useState<{ id: string; public_token: string } | null>(null)
  const [mode, setMode] = useState<"detail" | "emilia">("detail")
  // Conversación que ya trajo el gate de "Cotizar" (perf: el chat evita re-fetchear).
  const [emiliaConversation, setEmiliaConversation] = useState<{ id: string } | null | undefined>(undefined)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState(lead?.notes || "")
  const [savingNotes, setSavingNotes] = useState(false)
  const [comments, setComments] = useState<Array<{
    id: string
    comment: string
    created_at: string
    updated_at?: string
    user_id: string
    users: { id: string; name: string; email: string } | null
  }>>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [savingComment, setSavingComment] = useState(false)
  const [quotations, setQuotations] = useState<Array<{
    id: string
    quotation_number: string
    status: string
    total_amount: number
    currency: string
    pricing_mode?: "PER_PERSON" | "GROUP_TOTAL" | null
    adults?: number
    children?: number
    infants?: number
    destination: string
    created_at: string
    valid_until: string | null
    public_token: string | null
    quotation_options?: Array<{ id: string; title: string; total_amount: number }>
  }>>([])
  const [loadingQuotations, setLoadingQuotations] = useState(false)

  const getQuotationDisplayAmount = (quotation: {
    total_amount: number
    currency: string
    pricing_mode?: "PER_PERSON" | "GROUP_TOTAL" | null
    adults?: number
    children?: number
    infants?: number
  }) => {
    const pricing = getQuotationOptionPricing(
      { total_amount: quotation.total_amount || 0 },
      {
        adults: Number(quotation.adults || 0),
        children: Number(quotation.children || 0),
        infants: Number(quotation.infants || 0),
        pricing_mode: quotation.pricing_mode,
      }
    )
    const prefix = quotation.currency === "USD" ? "US$" : "$"

    return `${prefix} ${pricing.primaryAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
  }

  // Cargar cotizaciones del lead
  const loadQuotations = async () => {
    if (!lead) return
    setLoadingQuotations(true)
    try {
      const response = await fetch(`/api/quotations?lead_id=${lead.id}`)
      if (response.ok) {
        const data = await response.json()
        setQuotations(data.data || [])
      }
    } catch (error) {
      console.error("Error loading quotations:", error)
      toast.error("Error al cargar cotizaciones")
    } finally {
      setLoadingQuotations(false)
    }
  }

  // Cargar comentarios cuando se abre el dialog
  const loadComments = async () => {
    if (!lead) return
    setLoadingComments(true)
    try {
      const response = await fetch(`/api/leads/${lead.id}/comments`)
      if (response.ok) {
        const data = await response.json()
        setComments(data.comments || [])
      }
    } catch (error) {
      console.error("Error loading comments:", error)
      toast.error("Error al cargar comentarios")
    } finally {
      setLoadingComments(false)
    }
  }

  // Actualizar notesValue cuando cambia el lead
  useEffect(() => {
    if (lead) {
      setNotesValue(lead.notes || "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.notes])

  // Cargar comentarios y cotizaciones cuando se abre el dialog
  useEffect(() => {
    if (open && lead) {
      loadComments()
      loadQuotations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id])

  // Resetear mode cuando el modal se cierra
  useEffect(() => {
    if (!open) {
      setMode("detail")
      setEmiliaConversation(undefined)
    }
  }, [open])

  if (!lead) return null

  const handleAddComment = async () => {
    if (!newComment.trim()) return

    setSavingComment(true)
    try {
      const response = await fetch(`/api/leads/${lead.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: newComment }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al agregar comentario")
      }

      const data = await response.json()
      setComments([data.comment, ...comments])
      setNewComment("")
      toast.success("Comentario agregado correctamente")
    } catch (error) {
      console.error("Error adding comment:", error)
      toast.error(error instanceof Error ? error.message : "Error al agregar comentario")
    } finally {
      setSavingComment(false)
    }
  }

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesValue }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al guardar descripción")
      }

      toast.success("Descripción actualizada correctamente")
      setEditingNotes(false)
      onEdit?.(lead) // Refrescar datos
    } catch (error) {
      console.error("Error saving notes:", error)
      toast.error(error instanceof Error ? error.message : "Error al guardar descripción")
    } finally {
      setSavingNotes(false)
    }
  }

  const handleClaimLead = async () => {
    setClaiming(true)
    try {
      const response = await fetch("/api/leads/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al agarrar el lead")
      }

      toast.success(data.message || "Lead asignado correctamente")
      onClaim?.()
      onOpenChange(false)
    } catch (error) {
      console.error("Error claiming lead:", error)
      toast.error(error instanceof Error ? error.message : "Error al agarrar el lead")
    } finally {
      setClaiming(false)
    }
  }

  const handleArchive = async () => {
    if (!lead) return
    setArchiving(true)
    const isArchived = !!lead.archived_at
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived_at: isArchived ? null : new Date().toISOString() }),
      })
      if (!response.ok) throw new Error("Error al archivar lead")
      toast.success(isArchived ? "Lead restaurado correctamente" : "Lead archivado correctamente")
      onArchive?.()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al archivar lead")
    } finally {
      setArchiving(false)
    }
  }

  const handleEdit = () => {
    setEditDialogOpen(true)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Error al eliminar lead")
      }

      toast.success("Lead eliminado correctamente")
      onDelete?.()
      onOpenChange(false)
    } catch (error) {
      console.error("Error deleting lead:", error)
      toast.error(error instanceof Error ? error.message : "Error al eliminar lead")
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  const isFromTrello = lead.source === "Trello" && lead.trello_url

  // Formatear nombre del lead para mostrar: "Nombre - Destino - WhatsApp" (o Instagram si no hay teléfono)
  const formatLeadDisplayName = (lead: Lead): string => {
    const parts = [lead.contact_name]
    
    if (lead.destination && lead.destination !== "Sin destino") {
      parts.push(lead.destination)
    }
    
    if (lead.contact_phone) {
      parts.push(lead.contact_phone)
    } else if (lead.contact_instagram) {
      parts.push(`@${lead.contact_instagram}`)
    }
    
    return parts.join(" - ")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`p-0 ${mode === "emilia" ? "max-w-7xl w-[95vw] h-[90vh]" : "max-w-2xl"}`}>
        {mode === "emilia" ? (
          <LeadEmiliaChat
            lead={{
              id: lead.id,
              contact_name: lead.contact_name,
              contact_phone: lead.contact_phone,
              destination: lead.destination,
              region: lead.region,
              agency_id: lead.agency_id,
            }}
            initialConversation={emiliaConversation}
            onBack={() => setMode("detail")}
            onQuotationCreated={() => {
              // Recargar cotizaciones para que aparezcan al volver al mode="detail"
              loadQuotations()
            }}
          />
        ) : (
          <>
        {/* Header con nombre y badges */}
        <div className="px-6 pt-6 pb-4 border-b">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {lead.contact_name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge
              variant="outline"
              className={regionColors[lead.region] ? `${regionColors[lead.region]} text-white border-0` : ""}
            >
              {lead.region}
            </Badge>
            <Badge variant="outline">{statusLabels[lead.status] || lead.status}</Badge>
            <Badge variant="secondary">{lead.source}</Badge>
            {lead.trello_url && (
              <a
                href={lead.trello_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5 flex-1 min-h-0 overflow-y-auto">
          {/* Contacto + Viaje en grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Información de contacto */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <Users className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Contacto</h4>
              </div>
              <div className="space-y-2">
                {lead.contact_phone && (
                  <div className="flex items-center gap-2.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <a href={`tel:${lead.contact_phone}`} className="text-sm hover:underline truncate">
                      {lead.contact_phone}
                    </a>
                  </div>
                )}
                {lead.contact_email && (
                  <div className="flex items-center gap-2.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <a href={`mailto:${lead.contact_email}`} className="text-sm hover:underline truncate">
                      {lead.contact_email}
                    </a>
                  </div>
                )}
                {lead.contact_instagram && (
                  <div className="flex items-center gap-2.5">
                    <Instagram className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <a
                      href={`https://instagram.com/${lead.contact_instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm hover:underline truncate"
                    >
                      @{lead.contact_instagram}
                    </a>
                  </div>
                )}
                {!lead.contact_phone && !lead.contact_email && !lead.contact_instagram && (
                  <p className="text-xs text-muted-foreground">Sin datos de contacto</p>
                )}
              </div>
            </div>

            {/* Información del viaje */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Viaje</h4>
              </div>
              <div className="space-y-2">
                {lead.destination && lead.destination !== "Sin destino" && (
                  <div className="flex items-center gap-2.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium">{lead.destination}</span>
                  </div>
                )}
                {lead.agencies?.name && (
                  <div className="flex items-center gap-2.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm">Agencia: {lead.agencies.name}</span>
                  </div>
                )}
                {lead.created_at && (
                  <p className="text-xs text-muted-foreground">
                    Creado: {format(new Date(lead.created_at), "dd/MM/yyyy HH:mm")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Responsable */}
          {lead.users && (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-accent-violet/10">
                  <User className="h-3.5 w-3.5 text-accent-violet" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Responsable</h4>
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {(lead.users.name || "")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{lead.users.name || "Sin nombre"}</p>
                  {lead.users.email && <p className="text-xs text-muted-foreground">{lead.users.email}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Entidades Relacionadas (cuando el lead está convertido) */}
          {lead.status === "WON" && (lead.operations?.length || lead.customers?.length) ? (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Lead Convertido</h4>
              </div>
              <div className="space-y-2">
                {lead.operations && lead.operations.length > 0 && (
                  <Link href={`/operations/${lead.operations[0].id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/80 dark:bg-card/80 hover:bg-white transition-colors cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-success" />
                        <div>
                          <p className="text-sm font-medium">
                            {lead.operations[0].file_code || "Operacion"}
                          </p>
                          <p className="text-xs text-muted-foreground">{lead.operations[0].destination}</p>
                        </div>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </Link>
                )}
                {lead.customers && lead.customers.length > 0 && (
                  <Link href={`/customers/${lead.customers[0].id}`}>
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/80 dark:bg-card/80 hover:bg-white transition-colors cursor-pointer">
                      <User className="h-4 w-4 text-primary" />
                      <span className="text-sm flex-1">
                        {lead.customers[0].first_name} {lead.customers[0].last_name}
                      </span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </Link>
                )}
              </div>
            </div>
          ) : null}

          {/* Cotizaciones del Lead */}
          {(quotations.length > 0 || loadingQuotations) && (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-accent-coral/10">
                    <ClipboardList className="h-3.5 w-3.5 text-accent-coral" />
                  </div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Cotizaciones ({quotations.length})</h4>
                </div>
                {lead.status !== "WON" && lead.status !== "LOST" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingQuotationId(null)
                      setQuotationDialogOpen(true)
                    }}
                    className="h-7 text-xs"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Nueva
                  </Button>
                )}
              </div>
              {loadingQuotations ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cargando cotizaciones...
                </div>
              ) : (
                <div className="space-y-2">
                  {quotations.map((q) => {
                    const statusConfig: Record<string, { label: string; color: string }> = {
                      DRAFT: { label: "Borrador", color: "bg-muted text-muted-foreground" },
                      SENT: { label: "Enviada", color: "bg-accent-teal/10 text-accent-teal" },
                      APPROVED: { label: "Aprobada", color: "bg-success/10 text-success" },
                      REJECTED: { label: "Rechazada", color: "bg-destructive/10 text-destructive" },
                      EXPIRED: { label: "Vencida", color: "bg-accent-coral/10 text-accent-coral" },
                      CONVERTED: { label: "Convertida", color: "bg-primary/10 text-primary" },
                    }
                    const sc = statusConfig[q.status] || statusConfig.DRAFT
                    const isExpired = q.valid_until && new Date(q.valid_until) < new Date() && q.status === "SENT"

                    return (
                      <div
                        key={q.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-white/80 dark:bg-card/80 hover:bg-white dark:hover:bg-card transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{q.quotation_number}</p>
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${sc.color}`}>
                              {isExpired ? "Vencida" : sc.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {getQuotationDisplayAmount(q)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(q.created_at), "dd/MM/yyyy")}
                            </span>
                            {q.quotation_options && q.quotation_options.length > 1 && (
                              <span className="text-muted-foreground/70">
                                {q.quotation_options.length} opciones
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          {q.status === "DRAFT" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingQuotationId(q.id)
                                setQuotationDialogOpen(true)
                              }}
                              title="Editar borrador"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {q.public_token && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.open(`/cotizacion/${q.public_token}`, "_blank")
                              }}
                              title="Ver cotización pública"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {q.public_token && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                setPdfPriceQuotation({ id: q.id, public_token: q.public_token! })
                              }}
                              title="Generar PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sección de tags/funnels custom (opt-in via prop tagsSection).
              Solo se renderiza en tenants crm_mode='advanced' (ej. VICO). Para
              tenants legacy (Lozada y cualquier otro) la prop es undefined y
              esta sección no se monta — comportamiento idéntico al pre-cambio. */}
          {tagsSection && <div className="mb-1">{tagsSection}</div>}

          {/* Descripción/Notas */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                </div>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Descripcion</h4>
              </div>
              {!editingNotes ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingNotes(true)}
                  className="h-8"
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Editar
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingNotes(false)
                      setNotesValue(lead.notes || "")
                    }}
                    className="h-8"
                    disabled={savingNotes}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Cancelar
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="h-8"
                  >
                    {savingNotes ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3 mr-1" />
                    )}
                    Guardar
                  </Button>
                </div>
              )}
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              {editingNotes ? (
                <Textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Escribe la descripcion del lead..."
                  className="min-h-[100px] bg-background"
                  disabled={savingNotes}
                />
              ) : (
                <div className="text-sm">
                  <DescriptionWithLinks text={lead.notes || "Sin descripcion"} />
                </div>
              )}
            </div>
          </div>

          {/* Comentarios */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10">
                <MessageSquare className="h-3.5 w-3.5 text-primary" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Comentarios</h4>
            </div>
            
            {/* Formulario para agregar comentario */}
            <div className="flex gap-2">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Escribe un comentario..."
                className="min-h-[80px] bg-background"
                disabled={savingComment}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleAddComment()
                  }
                }}
              />
              <Button
                onClick={handleAddComment}
                disabled={!newComment.trim() || savingComment}
                size="sm"
                className="self-end"
              >
                {savingComment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Lista de comentarios */}
            {loadingComments ? (
              <div className="text-sm text-muted-foreground">Cargando comentarios...</div>
            ) : comments.length === 0 ? (
              <div className="text-sm text-muted-foreground">No hay comentarios aún</div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {comments.map((comment) => (
                  <div key={comment.id} className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {comment.users?.name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2) || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-medium">{comment.users?.name || "Usuario desconocido"}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(comment.created_at), "PPp")}
                          </p>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{comment.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Documentos Escaneados */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-success/10">
                <Download className="h-3.5 w-3.5 text-success" />
              </div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Documentos</h4>
            </div>
            <LeadDocumentsSection leadId={lead.id} />
          </div>
        </div>

        {/* Acciones - Footer fijo */}
        <div className="flex-shrink-0 border-t bg-muted/30 px-6 py-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {/* Botón Agarrar Lead - solo si no tiene vendedor asignado Y no es WON */}
            {!lead.assigned_seller_id && canClaimLeads && lead.status !== "WON" && (
              <Button
                size="sm"
                onClick={handleClaimLead}
                disabled={claiming}
                className="shrink-0"
              >
                {claiming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5">{claiming ? "Asignando..." : "Agarrar"}</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleEdit}
              className="shrink-0"
            >
              <Edit className="h-3.5 w-3.5" />
              <span className="ml-1.5">Editar</span>
            </Button>
            {/* Ver Operación - si ya tiene operación creada */}
            {lead.operations && lead.operations.length > 0 ? (
              <Button
                size="sm"
                asChild
                className="shrink-0 bg-success hover:bg-success/90"
              >
                <Link href={`/operations/${lead.operations[0].id}`}>
                  <Briefcase className="h-3.5 w-3.5" />
                  <span className="ml-1.5">Ver Operación</span>
                </Link>
              </Button>
            ) : (
              /* Cotizar o Convertir a Operación - solo si NO tiene operación y no está LOST */
              lead.status !== "LOST" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // Beta gate: si la feature flag está ON para la org, abrir chat embebido.
                      // Si está OFF (403) o hay error, caer al QuotationBuilder clásico.
                      try {
                        const res = await fetch(`/api/leads/${lead.id}/emilia`)
                        if (res.ok) {
                          // Perf: reusamos la conversación del gate para que el
                          // chat NO repita el GET en su init.
                          const json = await res.json().catch(() => ({}))
                          setEmiliaConversation(json?.data ?? null)
                          setMode("emilia")
                          return
                        }
                      } catch {
                        // network error → fallback al builder clásico
                      }
                      setEditingQuotationId(null)
                      setQuotationDialogOpen(true)
                    }}
                    className="shrink-0"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span className="ml-1.5">Cotizar</span>
                  </Button>
                  {onConvert && agencies.length > 0 && sellers.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConvertDialogOpen(true)}
                      className="shrink-0"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      <span className="ml-1.5">Convertir</span>
                    </Button>
                  )}
                </>
              )
            )}

            {/* Separador visual */}
            <div className="flex-1" />

            {onArchive && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-accent-coral hover:text-accent-coral hover:bg-accent-coral/10"
                onClick={handleArchive}
                disabled={archiving}
              >
                {archiving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : lead?.archived_at ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5">{archiving ? "..." : lead?.archived_at ? "Restaurar" : "Archivar"}</span>
              </Button>
            )}
            {onDelete && !isFromTrello && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="ml-1.5">Eliminar</span>
              </Button>
            )}
          </div>
          {isFromTrello && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Sincronizado con Trello — elimínalo desde allí.</span>
            </div>
          )}
        </div>
          </>
        )}
      </DialogContent>

      {/* Dialog de editar */}
      {agencies.length > 0 && sellers.length > 0 && (
        <EditLeadDialog
          lead={lead}
          agencies={agencies}
          sellers={sellers}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onSuccess={() => {
            if (lead) {
              onEdit?.(lead)
            }
            onOpenChange(false)
            // Recargar datos después de editar
            if (onDelete && lead) {
              onDelete()
              // Usar onDelete como callback de refresh (es el mismo propósito)
              onDelete()
            }
          }}
        />
      )}

      {/* Dialog de convertir */}
      {agencies.length > 0 && sellers.length > 0 && (
        <ConvertLeadDialog
          lead={lead}
          agencies={agencies}
          sellers={sellers}
          operators={operators}
          open={convertDialogOpen}
          onOpenChange={setConvertDialogOpen}
          onSuccess={() => {
            onConvert?.()
            onOpenChange(false)
          }}
        />
      )}

      {/* Dialog de cotización */}
      {lead && (
        <QuotationBuilderDialog
          key={`${lead.id}:${editingQuotationId || "new"}`}
          open={quotationDialogOpen}
          onOpenChange={(isOpen) => {
            setQuotationDialogOpen(isOpen)
            if (!isOpen) setEditingQuotationId(null)
          }}
          lead={{
            id: lead.id,
            contact_name: lead.contact_name,
            contact_phone: lead.contact_phone,
            contact_email: lead.contact_email,
            destination: lead.destination,
            region: lead.region,
            agency_id: lead.agency_id,
          }}
          operators={operators}
          existingQuotationId={editingQuotationId}
          onSuccess={() => {
            loadQuotations()
          }}
        />
      )}

      {/* Cambiar precio antes de generar el PDF de una cotización */}
      <QuotationPdfPriceDialog
        quotationId={pdfPriceQuotation?.id ?? null}
        onClose={() => setPdfPriceQuotation(null)}
        onGenerate={() => {
          if (pdfPriceQuotation) {
            window.open(getPublicQuotationPdfPath(pdfPriceQuotation.public_token), "_blank", "noopener,noreferrer")
            loadQuotations() // refrescar totales mostrados en la lista
          }
        }}
      />

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el lead de{" "}
              <strong>{lead.contact_name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}

