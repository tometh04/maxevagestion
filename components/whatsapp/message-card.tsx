"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  ExternalLink,
  CheckCircle,
  XCircle,
  Edit,
  Save,
  X,
  User,
  Phone,
  MapPin,
  Calendar,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import { toast } from "sonner"

interface Message {
  id: string
  customer_name: string
  phone: string
  message: string
  whatsapp_link: string
  status: string
  scheduled_for: string
  sent_at?: string
  customer_id?: string
  operation_id?: string
  message_templates?: {
    name: string
    emoji_prefix: string
    category: string
  }
  customers?: {
    first_name: string
    last_name: string
    email: string
  }
  operations?: {
    destination: string
    departure_date: string
  }
}

interface MessageCardProps {
  message: Message
  onMarkSent: () => void
  onSkip: () => void
}

const categoryColors: Record<string, string> = {
  PAYMENT: "bg-amber-100 text-amber-800",
  TRIP: "bg-blue-100 text-blue-800",
  QUOTATION: "bg-purple-100 text-purple-800",
  BIRTHDAY: "bg-pink-100 text-pink-800",
  ANNIVERSARY: "bg-rose-100 text-rose-800",
  MARKETING: "bg-green-100 text-green-800",
  CUSTOM: "bg-gray-100 text-gray-800",
}

export function MessageCard({ message, onMarkSent, onSkip }: MessageCardProps) {
  const [editing, setEditing] = useState(false)
  const [editedMessage, setEditedMessage] = useState(message.message)
  const [saving, setSaving] = useState(false)

  const isPending = message.status === "PENDING"
  const isSent = message.status === "SENT"
  const isSkipped = message.status === "SKIPPED"

  async function handleSaveEdit() {
    setSaving(true)
    try {
      const response = await fetch(`/api/whatsapp/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: editedMessage, phone: message.phone }),
      })

      if (response.ok) {
        toast.success("Mensaje actualizado")
        setEditing(false)
      } else {
        toast.error("Error al actualizar mensaje")
      }
    } catch (error) {
      toast.error("Error al actualizar mensaje")
    } finally {
      setSaving(false)
    }
  }

  function handleSend() {
    // Abrir WhatsApp
    window.open(message.whatsapp_link, "_blank")
    // Después de un delay, marcar como enviado
    setTimeout(() => {
      onMarkSent()
    }, 2000)
  }

  return (
    <Card className={`transition-all ${isSent ? "opacity-60" : ""} ${isSkipped ? "opacity-40" : ""}`}>
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Info Section */}
          <div className="flex-1 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{message.message_templates?.emoji_prefix || "📱"}</span>
                <div>
                  <div className="font-medium">{message.message_templates?.name || "Mensaje personalizado"}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <User className="h-3 w-3" />
                    <Link 
                      href={`/customers/${message.customer_id}`}
                      className="hover:underline"
                    >
                      {message.customer_name}
                    </Link>
                    <span>•</span>
                    <Phone className="h-3 w-3" />
                    {message.phone}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {message.message_templates?.category && (
                  <Badge className={categoryColors[message.message_templates.category] || ""}>
                    {message.message_templates.category}
                  </Badge>
                )}
                <Badge variant={isPending ? "default" : isSent ? "secondary" : "outline"}>
                  {isPending && "Pendiente"}
                  {isSent && "✓ Enviado"}
                  {isSkipped && "Omitido"}
                </Badge>
              </div>
            </div>

            {/* Context */}
            {message.operations && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {message.operations.destination}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(message.operations.departure_date), "dd/MM/yyyy")}
                </div>
              </div>
            )}

            {/* Message Content */}
            <div className="bg-muted/50 rounded-lg p-3 border-l-4 border-green-500">
              {editing ? (
                <Textarea
                  value={editedMessage}
                  onChange={(e) => setEditedMessage(e.target.value)}
                  rows={5}
                  className="resize-none"
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm font-sans">{message.message}</pre>
              )}
            </div>

            {/* Timestamps */}
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              {isPending && (
                <>
                  <span>
                    Programado: {format(new Date(message.scheduled_for), "dd/MM/yyyy HH:mm", { locale: es })}
                  </span>
                  <span>•</span>
                  <span>
                    {formatDistanceToNow(new Date(message.scheduled_for), { addSuffix: true, locale: es })}
                  </span>
                </>
              )}
              {isSent && message.sent_at && (
                <span>
                  Enviado: {format(new Date(message.sent_at), "dd/MM/yyyy HH:mm", { locale: es })}
                </span>
              )}
            </div>
          </div>

          {/* Actions Section */}
          <div className="flex lg:flex-col gap-2 lg:w-40 shrink-0">
            {isPending && (
              <>
                <Button onClick={handleSend} className="flex-1 bg-green-600 hover:bg-green-700">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Enviar
                </Button>
                {editing ? (
                  <>
                    <Button onClick={handleSaveEdit} variant="outline" disabled={saving}>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar
                    </Button>
                    <Button onClick={() => setEditing(false)} variant="ghost" size="icon">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setEditing(true)} variant="outline">
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                )}
                <Button onClick={onSkip} variant="ghost" className="text-muted-foreground">
                  <XCircle className="h-4 w-4 mr-2" />
                  Omitir
                </Button>
              </>
            )}
            {isSent && (
              <div className="flex items-center justify-center text-green-600">
                <CheckCircle className="h-5 w-5 mr-2" />
                Enviado
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

