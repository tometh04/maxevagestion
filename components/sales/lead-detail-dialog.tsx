"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { ExternalLink, MapPin, Users, Phone, Mail, Instagram, Calendar, FileText, Edit, Trash2, ArrowRight, AlertTriangle, UserPlus, Loader2, CheckCircle2, User, Briefcase, Save, X, MessageSquare, Send } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { ConvertLeadDialog } from "@/components/sales/convert-lead-dialog"
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

const regionColors: Record<string, string> = {
  ARGENTINA: "bg-amber-400 dark:bg-amber-600",
  CARIBE: "bg-amber-500 dark:bg-amber-500",
  BRASIL: "bg-amber-600 dark:bg-amber-400",
  EUROPA: "bg-amber-700 dark:bg-amber-300",
  EEUU: "bg-amber-800 dark:bg-amber-200",
  OTROS: "bg-amber-300 dark:bg-amber-700",
  CRUCEROS: "bg-amber-900 dark:bg-amber-100",
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
}

interface LeadDetailDialogProps {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  agencies?: Array<{ id: string; name: string }>
  sellers?: Array<{ id: string; name: string }>
  operators?: Array<{ id: string; name: string }>
  onEdit?: (lead: Lead) => void
  onDelete?: () => void
  onConvert?: () => void
  canClaimLeads?: boolean
  onClaim?: () => void
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
  onConvert,
  canClaimLeads = false,
  onClaim,
}: LeadDetailDialogProps) {
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
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

  if (!lead) return null

  // Actualizar notesValue cuando cambia el lead
  useEffect(() => {
    setNotesValue(lead.notes || "")
  }, [lead.notes])

  // Cargar comentarios cuando se abre el dialog
  useEffect(() => {
    if (open && lead) {
      loadComments()
    }
  }, [open, lead?.id])

  const loadComments = async () => {
    setLoadingComments(true)
    try {
      const response = await fetch(`/api/leads/${lead.id}/comments`)
      if (response.ok) {
        const data = await response.json()
        setComments(data.comments || [])
      }
    } catch (error) {
      console.error("Error loading comments:", error)
    } finally {
      setLoadingComments(false)
    }
  }

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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            {formatLeadDisplayName(lead)}
            {lead.trello_url && (
              <a
                href={lead.trello_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-5 w-5" />
              </a>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Información de contacto */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Información de Contacto</h3>
            <div className="space-y-2">
              {lead.contact_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${lead.contact_phone}`} className="text-sm hover:underline">
                    {lead.contact_phone}
                  </a>
                </div>
              )}
              {lead.contact_email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${lead.contact_email}`} className="text-sm hover:underline">
                    {lead.contact_email}
                  </a>
                </div>
              )}
              {lead.contact_instagram && (
                <div className="flex items-center gap-3">
                  <Instagram className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={`https://instagram.com/${lead.contact_instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm hover:underline"
                  >
                    @{lead.contact_instagram}
                  </a>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Información del viaje */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Información del Viaje</h3>
            <div className="space-y-2">
              {lead.destination && lead.destination !== "Sin destino" && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{lead.destination}</span>
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  variant="outline"
                  className={regionColors[lead.region] ? `${regionColors[lead.region]} text-white border-0` : ""}
                >
                  {lead.region}
                </Badge>
                <Badge variant="outline">{statusLabels[lead.status] || lead.status}</Badge>
                <Badge variant="secondary">{lead.source}</Badge>
              </div>
            </div>
          </div>

          <Separator />

          {/* Responsable */}
          {lead.users && (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Responsable</h3>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
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
              <Separator />
            </>
          )}

          {/* Entidades Relacionadas (cuando el lead está convertido) */}
          {lead.status === "WON" && (lead.operations?.length || lead.customers?.length) ? (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Lead Convertido
                </h3>
                <div className="space-y-2">
                  {/* Link a Operación */}
                  {lead.operations && lead.operations.length > 0 && (
                    <Link href={`/operations/${lead.operations[0].id}`}>
                      <div className="flex flex-col gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Briefcase className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-semibold text-green-900 dark:text-green-100">
                              Operación Creada
                            </span>
                          </div>
                          <ExternalLink className="h-4 w-4 text-green-600" />
                        </div>
                        <div className="text-sm space-y-1 ml-6">
                          {lead.operations[0].file_code && (
                            <p className="font-medium">{lead.operations[0].file_code}</p>
                          )}
                          <p className="text-muted-foreground">{lead.operations[0].destination}</p>
                          {lead.operations[0].created_at && (
                            <p className="text-xs text-muted-foreground">
                              Creada: {format(new Date(lead.operations[0].created_at), "dd/MM/yyyy")}
                            </p>
                          )}
                          {lead.operations[0].departure_date && (
                            <p className="text-xs text-muted-foreground">
                              Salida: {format(new Date(lead.operations[0].departure_date), "dd/MM/yyyy")}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  )}
                  
                  {/* Link a Cliente */}
                  {lead.customers && lead.customers.length > 0 && (
                    <Link href={`/customers/${lead.customers[0].id}`}>
                      <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                        <User className="h-4 w-4 text-primary" />
                        <span className="text-sm flex-1">
                          Cliente: {lead.customers[0].first_name} {lead.customers[0].last_name}
                        </span>
                        <ExternalLink className="h-3 w-3" />
                      </div>
                    </Link>
                  )}
                </div>
              </div>
              <Separator />
            </>
          ) : null}

          {/* Descripción/Notas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Descripción
              </h3>
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
            <div className="bg-muted/50 rounded-lg p-4">
              {editingNotes ? (
                <Textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Escribe la descripción del lead..."
                  className="min-h-[120px] bg-background"
                  disabled={savingNotes}
                />
              ) : (
                <DescriptionWithLinks text={lead.notes || "Sin descripción"} />
              )}
            </div>
          </div>
          <Separator />

          {/* Comentarios */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Comentarios
            </h3>
            
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
          <Separator />

          {/* Documentos Escaneados */}
          <LeadDocumentsSection leadId={lead.id} />
          <Separator />


          {/* Información adicional */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Información Adicional</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Agencia</p>
                <p className="font-medium">{lead.agencies?.name || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Creado</p>
                <p className="font-medium">
                  {format(new Date(lead.created_at), "PPp")}
                </p>
              </div>
              {lead.updated_at && (
                <div>
                  <p className="text-muted-foreground">Actualizado</p>
                  <p className="font-medium">
                    {format(new Date(lead.updated_at), "PPp")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <Separator />
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {/* Botón Agarrar Lead - solo si no tiene vendedor asignado Y no es WON */}
            {!lead.assigned_seller_id && canClaimLeads && lead.status !== "WON" && (
              <Button
                variant="default"
                onClick={handleClaimLead}
                disabled={claiming}
                className="flex-1 sm:flex-initial bg-orange-500 hover:bg-orange-600 text-white"
              >
                {claiming ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                {claiming ? "Asignando..." : "Agarrar Lead"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleEdit}
              className="flex-1 sm:flex-initial"
            >
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
            {/* Ver Operación - si ya tiene operación creada */}
            {lead.operations && lead.operations.length > 0 ? (
              <Button
                variant="default"
                asChild
                className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700"
              >
                <Link href={`/operations/${lead.operations[0].id}`}>
                  <Briefcase className="mr-2 h-4 w-4" />
                  Ver Operación
                </Link>
              </Button>
            ) : (
              /* Convertir a Operación - solo si NO tiene operación y no está LOST */
              onConvert && lead.status !== "LOST" && agencies.length > 0 && sellers.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setConvertDialogOpen(true)}
                  className="flex-1 sm:flex-initial"
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Convertir a Operación
                </Button>
              )
            )}
            {onDelete && !isFromTrello && (
              <Button
                variant="ghost"
                className="text-red-600 flex-1 sm:flex-initial hover:text-red-700 hover:bg-red-50"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </Button>
            )}
            {isFromTrello && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground w-full sm:w-auto">
                <AlertTriangle className="h-4 w-4" />
                <span>Este lead está sincronizado con Trello. Para eliminarlo, elimínalo desde Trello.</span>
              </div>
            )}
          </div>
        </DialogFooter>
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

