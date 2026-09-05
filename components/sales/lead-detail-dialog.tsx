"use client"

import type { SellerOption } from "@/lib/sellers/seller-option"
import type { QuotationOperatorOption } from "@/lib/operators/quotation-option"
import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ExternalLink, MapPin, Users, Phone, Mail, Instagram, Calendar, FileText, Edit, Trash2, ArrowRight, AlertTriangle, UserPlus, Loader2, CheckCircle2, User, Briefcase, Save, X, MessageSquare, Send, Archive, ArchiveRestore, ClipboardList, Clock, DollarSign, Eye, Download, MoreHorizontal, Upload, Paperclip, RefreshCw, MessageCircle } from "lucide-react"
import { useWhaControlAvailable } from "@/hooks/use-wha-control-available"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  getQuotationOptionPricing,
  QUOTATION_STATUS_LABELS,
} from "@/lib/quotations/presentation"
import { getPublicQuotationPath } from "@/lib/quotations/public-links"
import { downloadQuotationPdfFromPriceDialog } from "@/lib/pdf/quotation-pdf-html"
import { hasReadyQuotationDocument } from "@/lib/quotations/document-projection"
import { isQuotationContentEditable } from "@/lib/quotations/lifecycle"
import { getQuotationStatusColors } from "@/lib/vibook-status-colors"
import { fetchQuotationDocumentForUser } from "@/lib/quotation-documents/client"
import { QuotationPdfPriceDialog } from "@/components/sales/quotation-pdf-price-dialog"
import { QuotationPriceRefreshDialog } from "@/components/sales/quotation-price-refresh-dialog"
import { QuotationBookingDialog } from "@/components/sales/quotation-booking-dialog"
import { LeadEmiliaChat } from "@/components/sales/lead-emilia-chat"
import { LeadOutcomeBadge } from "@/components/sales/lead-outcome-badge"
import { useScreenView } from "@/hooks/use-screen-view"
import { detectBrowserOriginCity } from "@/lib/emilia/browser-geolocation"
import type { EmiliaDefaultOrigin } from "@/lib/emilia/origin-context"
import { useCan } from "@/components/permissions/permissions-provider"

// Las cotizaciones adjuntas (type QUOTATION) se muestran en la sección
// Cotizaciones, no en el listado genérico de documentos. Referencia estable
// para no re-disparar el fetch de LeadDocumentsSection en cada render.
const DOCS_EXCLUDE_QUOTATION = ["QUOTATION"]

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
  outcome?: string | null
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
  estimated_departure_date?: string | null
  estimated_checkin_date?: string | null
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
  sellers?: SellerOption[]
  operators?: QuotationOperatorOption[]
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
  useScreenView("lead-detail", open)
  const canWriteLeads = useCan("leads", "write")
  const whaControlAvailable = useWhaControlAvailable()
  const canDeleteQuotations = useCan("leads", "delete")
  const [quotationToDelete, setQuotationToDelete] = useState<{ id: string; quotation_number: string } | null>(null)
  const [deletingQuotation, setDeletingQuotation] = useState(false)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false)
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null)
  // Cotización con el dialog "Cambiar precio" / Generar PDF (mismo modal que Emilia)
  const [pdfPriceQuotation, setPdfPriceQuotation] = useState<{
    id: string
    public_token: string | null
    active_document_id?: string | null
    status: string
  } | null>(null)
  const [priceRefreshQuotationId, setPriceRefreshQuotationId] = useState<string | null>(null)
  const [mode, setMode] = useState<"detail" | "emilia">("detail")
  // Conversación que ya trajo el gate de "Cotizar" (perf: el chat evita re-fetchear).
  const [emiliaConversation, setEmiliaConversation] = useState<{ id: string } | null | undefined>(undefined)
  const [emiliaDefaultOrigin, setEmiliaDefaultOrigin] = useState<EmiliaDefaultOrigin | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [openingQuotation, setOpeningQuotation] = useState(false)
  // VIB-68: marcar resultado (venta / descarte) del lead.
  const [markingOutcome, setMarkingOutcome] = useState(false)
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false)
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
    active_document_id?: string | null
    document?: { status: "NONE" | "READY"; active_document_id: string | null }
    quotation_options?: Array<{ id: string; title: string; total_amount: number; is_selected?: boolean }>
    price_confirmation?: {
      confirmed: boolean
      run_id: string | null
      valid_until: string | null
      applied_at: string | null
    }
  }>>([])
  const [bookingQuotation, setBookingQuotation] = useState<(typeof quotations)[number] | null>(null)
  const [loadingQuotations, setLoadingQuotations] = useState(false)
  // Cotizaciones hechas con otra app: se suben como archivo adjunto (type QUOTATION).
  const [quotationFiles, setQuotationFiles] = useState<Array<{
    id: string
    file_url: string
    uploaded_at: string
  }>>([])
  const [uploadingQuotationFile, setUploadingQuotationFile] = useState(false)
  const quotationFileInputRef = React.useRef<HTMLInputElement>(null)

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
  const loadQuotations = async (options: { silent?: boolean } = {}) => {
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
      if (!options.silent) toast.error("Error al cargar cotizaciones")
    } finally {
      setLoadingQuotations(false)
    }
  }

  const handleDeleteQuotation = async () => {
    if (!quotationToDelete || !canDeleteQuotations || deletingQuotation) return
    const quotationId = quotationToDelete.id
    setDeletingQuotation(true)
    try {
      const response = await fetch(`/api/quotations/${quotationId}`, { method: "DELETE" })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "No se pudo eliminar la cotización")
      }
      setQuotations((current) => current.filter((quotation) => quotation.id !== quotationId))
      setQuotationToDelete(null)
      toast.success("Cotización eliminada")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la cotización")
    } finally {
      setDeletingQuotation(false)
    }
  }

  // Cargar cotizaciones subidas como archivo (hechas con otra app)
  const loadQuotationFiles = async () => {
    if (!lead) return
    try {
      const response = await fetch(`/api/leads/${lead.id}/documents`)
      if (response.ok) {
        const data = await response.json()
        const files = (data.documents || []).filter((d: any) => d.type === "QUOTATION")
        setQuotationFiles(files)
      }
    } catch (error) {
      console.error("Error loading quotation files:", error)
    }
  }

  // Subir una cotización externa como archivo adjunto al lead
  const handleQuotationFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !lead) return

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Tipo de archivo no permitido. Solo imágenes (JPEG, PNG, WebP) y PDF")
      if (quotationFileInputRef.current) quotationFileInputRef.current.value = ""
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo es demasiado grande. Máximo 10MB")
      if (quotationFileInputRef.current) quotationFileInputRef.current.value = ""
      return
    }

    try {
      setUploadingQuotationFile(true)
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", "QUOTATION")

      const response = await fetch(`/api/leads/${lead.id}/documents/upload`, {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || "Error al subir el archivo")
      }
      toast.success("Cotización subida")
      await loadQuotationFiles()
    } catch (error: any) {
      console.error("Error uploading quotation file:", error)
      toast.error(error.message || "Error al subir el archivo")
    } finally {
      setUploadingQuotationFile(false)
      if (quotationFileInputRef.current) quotationFileInputRef.current.value = ""
    }
  }

  const handleDeleteQuotationFile = async (documentId: string) => {
    if (!lead) return
    if (!confirm("¿Eliminar esta cotización?")) return
    try {
      const response = await fetch(`/api/leads/${lead.id}/documents/${documentId}`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Error al eliminar")
      toast.success("Cotización eliminada")
      await loadQuotationFiles()
    } catch (error: any) {
      console.error("Error deleting quotation file:", error)
      toast.error(error.message || "Error al eliminar")
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
      loadQuotationFiles()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id])

  // Resetear mode cuando el modal se cierra
  useEffect(() => {
    if (!open) {
      setMode("detail")
      setEmiliaConversation(undefined)
      setEmiliaDefaultOrigin(null)
      setOpeningQuotation(false)
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

  // VIB-68: marca el resultado del lead (SALE / DISCARDED) o lo reabre (null).
  const handleSetOutcome = async (outcome: "SALE" | "DISCARDED" | null) => {
    if (!lead) return
    setMarkingOutcome(true)
    try {
      const response = await fetch(`/api/leads/${lead.id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Error al actualizar el resultado")
      }
      toast.success(
        outcome === "SALE"
          ? "Lead marcado como venta"
          : outcome === "DISCARDED"
            ? "Lead descartado"
            : "Lead reabierto"
      )
      setDiscardDialogOpen(false)
      // Reutilizar onDelete como callback de refresh (mismo propósito que el resto del dialog)
      onDelete?.()
      onOpenChange(false)
    } catch (error) {
      console.error("Error setting lead outcome:", error)
      toast.error(error instanceof Error ? error.message : "Error al actualizar el resultado")
    } finally {
      setMarkingOutcome(false)
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

  const openManualQuotation = () => {
    setEditingQuotationId(null)
    setQuotationDialogOpen(true)
  }

  const handleStartQuotation = async () => {
    if (openingQuotation) return
    setOpeningQuotation(true)

    try {
      const quotaResponse = await fetch("/api/quotation-quota", { cache: "no-store" })
      if (quotaResponse.ok) {
        const quota = await quotaResponse.json().catch(() => null)
        if (quota?.usage?.enforcement_enabled && quota?.usage?.at_limit) {
          toast.error("La organización alcanzó el límite de cotizaciones. Un administrador debe ampliar el cupo.")
          return
        }
      }

      const response = await fetch(`/api/leads/${lead.id}/emilia`)
      const json = await response.json().catch(() => ({}))

      if (response.ok) {
        // El navegador muestra su permiso nativo. Si el usuario lo rechaza o
        // no podemos resolver ciudad/país, null mantiene el flujo de pregunta.
        const detectedOrigin = await detectBrowserOriginCity()
        // Reutilizamos la conversación del gate para evitar otro GET al montar.
        setEmiliaConversation(json?.data ?? null)
        setEmiliaDefaultOrigin(detectedOrigin)
        setMode("emilia")
        return
      }

      if (json?.code === "emilia_plan_required") {
        toast.info("Emilia requiere el plan Enterprise. Abrimos el cotizador manual.")
        openManualQuotation()
        return
      }

      if (response.status === 403 || response.status === 404) {
        toast.error(json?.error || "No tiene acceso para cotizar este lead")
        return
      }

      toast.warning("Emilia no está disponible en este momento. Abrimos el cotizador manual.")
      openManualQuotation()
    } catch {
      toast.warning("No se pudo conectar con Emilia. Abrimos el cotizador manual.")
      openManualQuotation()
    } finally {
      setOpeningQuotation(false)
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
      <DialogContent className={`p-0 ${mode === "emilia" ? "max-w-[1700px] w-[97vw] h-[92vh] overflow-hidden" : "max-w-2xl"}`}>
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
            defaultOrigin={emiliaDefaultOrigin}
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
            <LeadOutcomeBadge
              outcome={lead.outcome}
              status={lead.status}
              hasOperation={!!(lead.operations && lead.operations.length > 0)}
            />
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
                    {whaControlAvailable ? (
                      <a
                        href={`/tools/wha-control?phone=${encodeURIComponent(lead.contact_phone)}`}
                        className="flex items-center gap-1.5 text-sm hover:underline truncate"
                        title="Abrir el chat en WHA Control"
                      >
                        {lead.contact_phone}
                        <MessageCircle className="h-3.5 w-3.5 text-success flex-shrink-0" />
                      </a>
                    ) : (
                      <a href={`tel:${lead.contact_phone}`} className="text-sm hover:underline truncate">
                        {lead.contact_phone}
                      </a>
                    )}
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
          {(quotations.length > 0 || quotationFiles.length > 0 || loadingQuotations || (lead.status !== "WON" && lead.status !== "LOST")) && (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-accent-coral/10">
                    <ClipboardList className="h-3.5 w-3.5 text-accent-coral" />
                  </div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">Cotizaciones ({quotations.length + quotationFiles.length})</h4>
                </div>
                {lead.status !== "WON" && lead.status !== "LOST" && (
                  <div className="flex items-center gap-1">
                    {/* Subir cotización hecha con otra app como archivo adjunto */}
                    <input
                      ref={quotationFileInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleQuotationFileUpload}
                      className="hidden"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => quotationFileInputRef.current?.click()}
                      disabled={uploadingQuotationFile}
                      className="h-7 text-xs"
                      title="Subir una cotización hecha con otra app"
                    >
                      {uploadingQuotationFile ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3 mr-1" />
                      )}
                      Subir
                    </Button>
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
                  </div>
                )}
              </div>
              {loadingQuotations ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cargando cotizaciones...
                </div>
              ) : quotations.length === 0 && quotationFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">
                  Este lead no tiene cotizaciones.
                  {lead.status !== "WON" && lead.status !== "LOST" && " Usá “Nueva” para armar una, o “Subir” para adjuntar la de otra app."}
                </p>
              ) : (
                <div className="space-y-2">
                  {quotations.map((q) => {
                    const isExpired = q.valid_until && new Date(q.valid_until) < new Date() && q.status === "SENT"
                    const effectiveStatus = isExpired ? "EXPIRED" : q.status
                    const statusColors = getQuotationStatusColors(effectiveStatus)
                    const statusClasses = `${statusColors.bg} ${statusColors.text} ${statusColors.border}`
                    const statusLabel = QUOTATION_STATUS_LABELS[effectiveStatus] || effectiveStatus
                    const documentReady = hasReadyQuotationDocument(q)
                    const quotationEditable = isQuotationContentEditable(q.status)
                    const canRefreshPrices = ["DRAFT", "SENT", "PENDING_APPROVAL"].includes(q.status)

                    return (
                      <div
                        key={q.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-white/80 dark:bg-card/80 hover:bg-white dark:hover:bg-card transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{q.quotation_number}</p>
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusClasses}`}>
                              {statusLabel}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={documentReady
                                ? "text-[10px] px-1.5 py-0 border-success/30 text-success"
                                : "text-[10px] px-1.5 py-0 text-muted-foreground"}
                            >
                              {documentReady ? "Documento emitido" : "Sin emitir"}
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
                          {canRefreshPrices && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(event) => {
                                event.stopPropagation()
                                setPriceRefreshQuotationId(q.id)
                              }}
                              title="Actualizar precio y disponibilidad"
                              aria-label={`Actualizar precio y disponibilidad de ${q.quotation_number}`}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canWriteLeads && (q.status === "APPROVED" || q.price_confirmation?.confirmed === true) && (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 text-xs bg-success hover:bg-success/90"
                              onClick={(event) => {
                                event.stopPropagation()
                                setBookingQuotation(q)
                              }}
                            >
                              <Briefcase className="mr-1 h-3.5 w-3.5" />
                              Convertir y reservar
                            </Button>
                          )}
                          {/* El lápiz vuelve a abrir la estructura completa del borrador. */}
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
                              title="Editar servicios y opciones"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {q.public_token && q.active_document_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.open(getPublicQuotationPath(q.public_token!), "_blank")
                              }}
                              title="Ver cotización pública"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (quotationEditable) {
                                setPdfPriceQuotation({
                                  id: q.id,
                                  public_token: q.public_token,
                                  status: q.status,
                                })
                              } else {
                                void downloadQuotationPdfFromPriceDialog({
                                  quotationId: q.id,
                                  publicToken: q.public_token,
                                })
                                  .then(() => loadQuotations({ silent: true }))
                                  .catch((error) => toast.error(
                                    error instanceof Error ? error.message : "No se pudo descargar el documento emitido"
                                  ))
                              }
                            }}
                            disabled={!quotationEditable && !documentReady}
                            title={!quotationEditable && !documentReady ? "La cotización no tiene un PDF emitido" : "Generar PDF"}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {canDeleteQuotations && q.status === "DRAFT" && !documentReady && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 shrink-0 p-0 text-destructive hover:text-destructive"
                              onClick={() => setQuotationToDelete(q)}
                              disabled={deletingQuotation}
                              title="Eliminar cotización"
                              aria-label={`Eliminar cotización ${q.quotation_number}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Cotizaciones subidas como archivo (hechas con otra app) */}
                  {quotationFiles.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/80 dark:bg-card/80 hover:bg-white dark:hover:bg-card transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <p className="text-sm font-medium truncate">Cotización adjunta</p>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground">
                            Archivo
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(f.uploaded_at), "dd/MM/yyyy")}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => window.open(f.file_url, "_blank")}
                          title="Ver archivo"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteQuotationFile(f.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
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
            <LeadDocumentsSection leadId={lead.id} excludeTypes={DOCS_EXCLUDE_QUOTATION} />
          </div>
        </div>

        {/* Acciones - Footer fijo */}
        <div className="flex-shrink-0 border-t bg-muted/30 px-6 py-3">
          {(() => {
            const hasOp = !!(lead.operations && lead.operations.length > 0)
            const resolved = hasOp || lead.outcome === "SALE" || lead.outcome === "DISCARDED" || lead.status === "LOST"
            const canReopen = !hasOp && (lead.outcome === "SALE" || lead.outcome === "DISCARDED")
            const canConvert = !hasOp && lead.status !== "LOST" && !!onConvert && agencies.length > 0 && sellers.length > 0
            const canQuote = canWriteLeads && !hasOp && lead.status !== "LOST"
            const canClaim = !lead.assigned_seller_id && canClaimLeads && lead.status !== "WON"
            return (
              <div className="flex items-center gap-1.5">
                {/* Acción primaria contextual */}
                {hasOp ? (
                  <Button size="sm" asChild className="shrink-0 bg-success hover:bg-success/90">
                    <Link href={`/operations/${lead.operations![0].id}`}>
                      <Briefcase className="h-3.5 w-3.5" />
                      <span className="ml-1.5">Ver Operación</span>
                    </Link>
                  </Button>
                ) : canConvert ? (
                  <Button
                    size="sm"
                    onClick={() => setConvertDialogOpen(true)}
                    className="shrink-0"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    <span className="ml-1.5">Crear operación</span>
                  </Button>
                ) : null}

                <div className="flex-1" />

                {/* Menú "Más" con el resto de las acciones */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="shrink-0">
                      {(markingOutcome || archiving || claiming) ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1.5">Más</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {canQuote && (
                      <DropdownMenuItem onClick={handleStartQuotation} disabled={openingQuotation}>
                        <FileText className="h-4 w-4" />
                        {openingQuotation ? "Abriendo..." : "Cotizar"}
                      </DropdownMenuItem>
                    )}
                    {!resolved && (
                      <DropdownMenuItem
                        onClick={() => handleSetOutcome("SALE")}
                        disabled={markingOutcome}
                        className="text-success focus:text-success"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Marcar vendido (sin operación)
                      </DropdownMenuItem>
                    )}
                    {!resolved && (
                      <DropdownMenuItem onClick={() => setDiscardDialogOpen(true)} disabled={markingOutcome}>
                        <X className="h-4 w-4" />
                        Marcar descarte
                      </DropdownMenuItem>
                    )}
                    {canReopen && (
                      <DropdownMenuItem onClick={() => handleSetOutcome(null)} disabled={markingOutcome}>
                        <ArchiveRestore className="h-4 w-4" />
                        Reabrir
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleEdit}>
                      <Edit className="h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    {canClaim && (
                      <DropdownMenuItem onClick={handleClaimLead} disabled={claiming}>
                        <UserPlus className="h-4 w-4" />
                        {claiming ? "Asignando..." : "Agarrar lead"}
                      </DropdownMenuItem>
                    )}
                    {onArchive && (
                      <DropdownMenuItem onClick={handleArchive} disabled={archiving}>
                        {lead?.archived_at ? (
                          <ArchiveRestore className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                        {lead?.archived_at ? "Restaurar" : "Archivar"}
                      </DropdownMenuItem>
                    )}
                    {onDelete && !isFromTrello && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteDialogOpen(true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })()}
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

      {/* VIB-68: Confirmar descarte */}
      <AlertDialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar lead</AlertDialogTitle>
            <AlertDialogDescription>
              El lead va a quedar marcado como descartado en las estadísticas de
              conversión. Podés reabrirlo después si hace falta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markingOutcome}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={markingOutcome}
              onClick={(e) => {
                e.preventDefault()
                handleSetOutcome("DISCARDED")
              }}
            >
              {markingOutcome ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5">Descartar</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <QuotationPriceRefreshDialog
        quotationId={priceRefreshQuotationId}
        onClose={() => setPriceRefreshQuotationId(null)}
        onApplied={loadQuotations}
      />

      {bookingQuotation && (
        <QuotationBookingDialog
          quotation={{
            ...bookingQuotation,
            lead: {
              contact_name: lead.contact_name,
              contact_email: lead.contact_email,
              contact_phone: lead.contact_phone,
            },
          }}
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) setBookingQuotation(null)
          }}
          onQueued={() => {
            void loadQuotations({ silent: true })
          }}
        />
      )}

      {/* Mismo modal Generar PDF que Emilia: precio, adicionales y descarga */}
      <QuotationPdfPriceDialog
        quotationId={pdfPriceQuotation?.id ?? null}
        onClose={() => setPdfPriceQuotation(null)}
        onGenerate={async (_quotationId, expectedUpdatedAt) => {
          if (!pdfPriceQuotation) return
          try {
            return await downloadQuotationPdfFromPriceDialog({
              quotationId: pdfPriceQuotation.id,
              publicToken: pdfPriceQuotation.public_token,
              expectedUpdatedAt,
            })
          } finally {
            await loadQuotations({ silent: true })
          }
        }}
        sendValidationError={!pdfPriceQuotation?.public_token
          ? "La cotización no tiene enlace público"
          : !(lead.contact_phone?.replace(/[^0-9+]/g, "") || "")
            ? "El lead no tiene un teléfono para WhatsApp"
            : undefined}
        onSend={pdfPriceQuotation && ["DRAFT", "SENT", "PENDING_APPROVAL"].includes(pdfPriceQuotation.status) ? async (_quotationId, sendWindow, expectedUpdatedAt) => {
          if (!pdfPriceQuotation?.public_token) throw new Error("La cotización no tiene enlace público")
          const phone = lead.contact_phone?.replace(/[^0-9+]/g, "") || ""
          if (!phone) throw new Error("El lead no tiene un teléfono para WhatsApp")
          const document = await fetchQuotationDocumentForUser(pdfPriceQuotation.id, {
            issue: true,
            markSent: true,
            expectedUpdatedAt,
          })
          const publicUrl = `${window.location.origin}${getPublicQuotationPath(pdfPriceQuotation.public_token)}`
          const cleanPhone = phone.startsWith("+") ? phone.slice(1) : phone
          const message = encodeURIComponent(`Hola ${lead.contact_name}! Te paso tu cotización:\n\n${publicUrl}\n\nQuedo a disposición por cualquier consulta.`)
          const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`
          sendWindow.location.href = whatsappUrl
          toast.success("Cotización preparada para enviar")
          void loadQuotations({ silent: true })
          return document
        } : undefined}
      />

      <AlertDialog
        open={quotationToDelete !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !deletingQuotation) setQuotationToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cotización?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente la cotización <strong>{quotationToDelete?.quotation_number}</strong>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingQuotation}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleDeleteQuotation()
              }}
              disabled={deletingQuotation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingQuotation ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

