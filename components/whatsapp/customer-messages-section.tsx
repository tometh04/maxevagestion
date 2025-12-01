"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MessageSquare,
  Send,
  CheckCircle,
  Clock,
  Plus,
  ExternalLink,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { toast } from "sonner"
import { EmptyState } from "@/components/ui/empty-state"

interface Message {
  id: string
  message: string
  whatsapp_link: string
  status: string
  scheduled_for: string
  sent_at?: string
  message_templates?: {
    name: string
    emoji_prefix: string
  }
  operations?: {
    destination: string
  }
}

interface Template {
  id: string
  name: string
  template: string
  emoji_prefix: string
  category: string
}

interface CustomerMessagesSectionProps {
  customerId: string
  customerName: string
  customerPhone: string
  agencyId: string
}

export function CustomerMessagesSection({
  customerId,
  customerName,
  customerPhone,
  agencyId,
}: CustomerMessagesSectionProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessageOpen, setNewMessageOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string>("")
  const [customMessage, setCustomMessage] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchMessages()
    fetchTemplates()
  }, [customerId])

  async function fetchMessages() {
    try {
      const response = await fetch(`/api/whatsapp/messages?customerId=${customerId}`)
      if (!response.ok) {
        setMessages([])
        return
      }
      const data = await response.json()
      setMessages(data.messages || [])
    } catch (error) {
      // Silently fail - table might not exist yet
      setMessages([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchTemplates() {
    try {
      const response = await fetch("/api/whatsapp/templates?isActive=true")
      if (!response.ok) {
        setTemplates([])
        return
      }
      const data = await response.json()
      setTemplates((data.templates || []).filter((t: Template) => t.category === "CUSTOM" || t.category === "MARKETING"))
    } catch (error) {
      // Silently fail - table might not exist yet
      setTemplates([])
    }
  }

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplate(templateId)
    const template = templates.find((t) => t.id === templateId)
    if (template) {
      // Reemplazar variable {nombre}
      const firstName = (customerName || "").split(" ")[0] || "Cliente"
      const message = template.template.replace(/{nombre}/g, firstName)
      setCustomMessage(message)
    }
  }

  async function handleSendMessage() {
    if (!customMessage.trim()) {
      toast.error("Escribe un mensaje")
      return
    }

    if (!customerPhone) {
      toast.error("El cliente no tiene teléfono registrado")
      return
    }

    setSending(true)
    try {
      const response = await fetch("/api/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: selectedTemplate || null,
          customer_id: customerId,
          phone: customerPhone,
          customer_name: customerName,
          message: customMessage,
          agency_id: agencyId,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success("Mensaje creado")
        setNewMessageOpen(false)
        setCustomMessage("")
        setSelectedTemplate("")
        fetchMessages()

        // Abrir WhatsApp automáticamente
        if (data.message?.whatsapp_link) {
          window.open(data.message.whatsapp_link, "_blank")
        }
      } else {
        toast.error(data.error || "Error al crear mensaje")
      }
    } catch (error) {
      toast.error("Error al crear mensaje")
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Mensajes WhatsApp
        </CardTitle>
        <Dialog open={newMessageOpen} onOpenChange={setNewMessageOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Mensaje
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enviar Mensaje a {customerName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Template (opcional)</Label>
                <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.emoji_prefix} {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Mensaje</Label>
                <Textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={6}
                  placeholder="Escribe tu mensaje..."
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSendMessage} disabled={sending || !customMessage.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  Crear y Abrir WhatsApp
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Sin mensajes"
            description="No hay mensajes registrados para este cliente"
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {messages.slice(0, 5).map((msg) => (
              <div
                key={msg.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
              >
                <span className="text-xl">
                  {msg.message_templates?.emoji_prefix || "📱"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">
                      {msg.message_templates?.name || "Mensaje personalizado"}
                    </span>
                    <Badge
                      variant={msg.status === "SENT" ? "secondary" : "default"}
                      className="text-xs"
                    >
                      {msg.status === "SENT" && <CheckCircle className="h-3 w-3 mr-1" />}
                      {msg.status === "PENDING" && <Clock className="h-3 w-3 mr-1" />}
                      {msg.status === "SENT" ? "Enviado" : "Pendiente"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {msg.message}
                  </p>
                  <div className="text-xs text-muted-foreground mt-1">
                    {msg.sent_at
                      ? format(new Date(msg.sent_at), "dd/MM/yyyy HH:mm")
                      : formatDistanceToNow(new Date(msg.scheduled_for), {
                          addSuffix: true,
                          locale: es,
                        })}
                  </div>
                </div>
                {msg.status === "PENDING" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(msg.whatsapp_link, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {messages.length > 5 && (
              <Button variant="link" className="w-full">
                Ver todos ({messages.length})
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

