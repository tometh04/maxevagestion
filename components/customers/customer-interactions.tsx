"use client"

import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Loader2, Plus, Phone, Mail, MessageSquare, Video, Users, 
  FileText, Calendar, Clock, CheckCircle2, AlertCircle, 
  MoreHorizontal, Filter
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { format, formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Interaction {
  id: string
  interaction_type: string
  direction: string
  subject: string
  content: string
  outcome: string
  follow_up_date: string | null
  follow_up_notes: string
  is_follow_up_completed: boolean
  duration_minutes: number | null
  tags: string[]
  created_at: string
  created_by_user?: {
    id: string
    first_name: string
    last_name: string
    avatar_url: string
  }
  operation?: {
    id: string
    file_code: string
    destination: string
  }
}

interface CustomerInteractionsProps {
  customerId: string
  customerName?: string
}

const interactionTypes = [
  { value: 'call', label: 'Llamada', icon: Phone, color: 'bg-blue-500' },
  { value: 'email', label: 'Email', icon: Mail, color: 'bg-amber-500' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'bg-green-500' },
  { value: 'meeting', label: 'Reunión', icon: Users, color: 'bg-purple-500' },
  { value: 'video_call', label: 'Videollamada', icon: Video, color: 'bg-indigo-500' },
  { value: 'note', label: 'Nota', icon: FileText, color: 'bg-gray-500' },
  { value: 'task', label: 'Tarea', icon: CheckCircle2, color: 'bg-cyan-500' },
  { value: 'quote_sent', label: 'Cotización enviada', icon: FileText, color: 'bg-orange-500' },
  { value: 'quote_approved', label: 'Cotización aprobada', icon: CheckCircle2, color: 'bg-emerald-500' },
  { value: 'payment', label: 'Pago', icon: FileText, color: 'bg-green-600' },
  { value: 'complaint', label: 'Reclamo', icon: AlertCircle, color: 'bg-red-500' },
  { value: 'feedback', label: 'Feedback', icon: MessageSquare, color: 'bg-pink-500' },
  { value: 'other', label: 'Otro', icon: MoreHorizontal, color: 'bg-slate-500' },
]

const outcomeLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  successful: { label: 'Exitoso', variant: 'default' },
  no_answer: { label: 'Sin respuesta', variant: 'secondary' },
  callback: { label: 'Llamar después', variant: 'outline' },
  interested: { label: 'Interesado', variant: 'default' },
  not_interested: { label: 'No interesado', variant: 'destructive' },
  completed: { label: 'Completado', variant: 'default' },
  pending: { label: 'Pendiente', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
}

export function CustomerInteractions({ customerId, customerName }: CustomerInteractionsProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> }>({ total: 0, byType: {} })
  const [typeFilter, setTypeFilter] = useState("ALL")
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    interaction_type: 'call' as string,
    direction: 'outbound' as string,
    subject: '',
    content: '',
    outcome: '' as string,
    duration_minutes: undefined as number | undefined,
    follow_up_date: '',
    follow_up_notes: '',
  })

  useEffect(() => {
    loadInteractions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, typeFilter])

  const loadInteractions = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (typeFilter !== "ALL") params.append("type", typeFilter)

      const response = await fetch(`/api/customers/${customerId}/interactions?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error('Error al cargar interacciones')
      }

      const data = await response.json()
      setInteractions(data.interactions || [])
      setStats(data.stats || { total: 0, byType: {} })
    } catch (error: any) {
      console.error('Error loading interactions:', error)
      toast({
        title: "Error",
        description: error.message || "No se pudieron cargar las interacciones",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const createInteraction = async () => {
    try {
      setSaving(true)
      
      const response = await fetch(`/api/customers/${customerId}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          duration_minutes: formData.duration_minutes || null,
          outcome: formData.outcome || null,
          follow_up_date: formData.follow_up_date || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al crear interacción')
      }

      toast({
        title: "Interacción registrada",
        description: "La interacción se registró correctamente",
      })
      
      setIsCreateOpen(false)
      resetForm()
      loadInteractions()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setFormData({
      interaction_type: 'call',
      direction: 'outbound',
      subject: '',
      content: '',
      outcome: '',
      duration_minutes: undefined,
      follow_up_date: '',
      follow_up_notes: '',
    })
  }

  const getTypeInfo = (type: string) => {
    return interactionTypes.find(t => t.value === type) || interactionTypes[interactionTypes.length - 1]
  }

  return (
    <div className="space-y-4">
      {/* Header con estadísticas */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Historial de Interacciones</h3>
          <p className="text-sm text-muted-foreground">
            {stats.total} interacciones registradas
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filtrar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas</SelectItem>
              {interactionTypes.map(type => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva
          </Button>
        </div>
      </div>

      {/* Timeline de interacciones */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : interactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay interacciones registradas
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {interactions.map((interaction, index) => {
                  const typeInfo = getTypeInfo(interaction.interaction_type)
                  const Icon = typeInfo.icon

                  return (
                    <div key={interaction.id} className="flex gap-4">
                      {/* Línea de tiempo */}
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center text-white",
                          typeInfo.color
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        {index < interactions.length - 1 && (
                          <div className="w-0.5 h-full bg-border flex-1 mt-2" />
                        )}
                      </div>

                      {/* Contenido */}
                      <div className="flex-1 pb-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{typeInfo.label}</span>
                              {interaction.direction && (
                                <Badge variant="outline" className="text-xs">
                                  {interaction.direction === 'inbound' ? 'Entrante' : 
                                   interaction.direction === 'outbound' ? 'Saliente' : 'Interno'}
                                </Badge>
                              )}
                              {interaction.outcome && outcomeLabels[interaction.outcome] && (
                                <Badge variant={outcomeLabels[interaction.outcome].variant}>
                                  {outcomeLabels[interaction.outcome].label}
                                </Badge>
                              )}
                            </div>
                            {interaction.subject && (
                              <p className="text-sm font-medium mt-1">{interaction.subject}</p>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground text-right">
                            <div>{format(new Date(interaction.created_at), "dd MMM yyyy", { locale: es })}</div>
                            <div>{format(new Date(interaction.created_at), "HH:mm")}</div>
                          </div>
                        </div>

                        {interaction.content && (
                          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                            {interaction.content}
                          </p>
                        )}

                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {interaction.duration_minutes && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {interaction.duration_minutes} min
                            </span>
                          )}
                          {interaction.created_by_user && (
                            <span>
                              Por: {interaction.created_by_user.first_name} {interaction.created_by_user.last_name}
                            </span>
                          )}
                          {interaction.operation && (
                            <span>
                              Op: {interaction.operation.file_code}
                            </span>
                          )}
                        </div>

                        {interaction.follow_up_date && !interaction.is_follow_up_completed && (
                          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded text-sm">
                            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                              <Calendar className="h-4 w-4" />
                              <span>Seguimiento: {format(new Date(interaction.follow_up_date), "dd/MM/yyyy HH:mm", { locale: es })}</span>
                            </div>
                            {interaction.follow_up_notes && (
                              <p className="text-muted-foreground mt-1">{interaction.follow_up_notes}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Dialog crear interacción */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Interacción</DialogTitle>
            <DialogDescription>
              Registra una nueva interacción con {customerName || 'el cliente'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo *</Label>
                <Select 
                  value={formData.interaction_type} 
                  onValueChange={(v) => setFormData({ ...formData, interaction_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {interactionTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dirección</Label>
                <Select 
                  value={formData.direction} 
                  onValueChange={(v) => setFormData({ ...formData, direction: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Saliente</SelectItem>
                    <SelectItem value="inbound">Entrante</SelectItem>
                    <SelectItem value="internal">Interno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Asunto</Label>
              <Input
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Asunto de la interacción"
              />
            </div>

            <div>
              <Label>Contenido / Notas</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Detalles de la interacción..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Resultado</Label>
                <Select 
                  value={formData.outcome} 
                  onValueChange={(v) => setFormData({ ...formData, outcome: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="successful">Exitoso</SelectItem>
                    <SelectItem value="no_answer">Sin respuesta</SelectItem>
                    <SelectItem value="callback">Llamar después</SelectItem>
                    <SelectItem value="interested">Interesado</SelectItem>
                    <SelectItem value="not_interested">No interesado</SelectItem>
                    <SelectItem value="completed">Completado</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duración (min)</Label>
                <Input
                  type="number"
                  value={formData.duration_minutes || ''}
                  onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="Ej: 15"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="text-muted-foreground">Programar seguimiento (opcional)</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <Label>Fecha y hora</Label>
                  <Input
                    type="datetime-local"
                    value={formData.follow_up_date}
                    onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Notas del seguimiento</Label>
                  <Input
                    value={formData.follow_up_notes}
                    onChange={(e) => setFormData({ ...formData, follow_up_notes: e.target.value })}
                    placeholder="Recordatorio..."
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createInteraction} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
