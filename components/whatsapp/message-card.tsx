"use client"

import { useState } from "react"
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
  Phone,
  MapPin,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
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
  PAYMENT: "bg-warning/10 text-warning",
  TRIP: "bg-info/10 text-info",
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
  const [expanded, setExpanded] = useState(false)

  const isPending = message.status === "PENDING"
  const isSent = message.status === "SENT"
  const isSkipped = message.status === "SKIPPED"

  const firstLine = message.message.split("\n")[0]
  const hasMoreLines = message.message.includes("\n") || message.message.length > 100

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
    window.open(message.whatsapp_link, "_blank")
    setTimeout(() => {
      onMarkSent()
    }, 2000)
  }

  return (
    <div
      className={`rounded-xl border border-border/40 p-3 space-y-2 transition-all ${
        isSent ? "opacity-60" : ""
      } ${isSkipped ? "opacity-40" : ""}`}
    >
      {/* Row 1: Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 text-sm">
          <span>{message.message_templates?.emoji_prefix || "📱"}</span>
          <span className="font-medium truncate">
            {message.message_templates?.name || "Mensaje personalizado"}
          </span>
          <span className="text-muted-foreground">·</span>
          <Link
            href={`/customers/${message.customer_id}`}
            className="text-muted-foreground hover:underline truncate"
          >
            {message.customer_name}
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground flex items-center gap-0.5 shrink-0">
            <Phone className="h-3 w-3" />
            {message.phone}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {message.message_templates?.category && (
            <Badge
              className={`text-[10px] ${
                categoryColors[message.message_templates.category] || ""
              }`}
            >
              {message.message_templates.category}
            </Badge>
          )}
          <Badge
            variant={isPending ? "default" : isSent ? "secondary" : "outline"}
            className="text-[10px]"
          >
            {isPending && "Pendiente"}
            {isSent && "Enviado"}
            {isSkipped && "Omitido"}
          </Badge>
        </div>
      </div>

      {/* Row 2: Context (destination + date) */}
      {message.operations && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <MapPin className="h-3 w-3" />
            {message.operations.destination}
          </span>
          <span className="flex items-center gap-0.5">
            <Calendar className="h-3 w-3" />
            {format(new Date(message.operations.departure_date), "dd/MM/yyyy")}
          </span>
        </div>
      )}

      {/* Row 3: Message preview / edit */}
      {editing ? (
        <Textarea
          value={editedMessage}
          onChange={(e) => setEditedMessage(e.target.value)}
          rows={5}
          className="resize-none text-sm"
        />
      ) : (
        <div className="text-xs text-muted-foreground">
          {expanded ? (
            <pre className="whitespace-pre-wrap font-sans">{message.message}</pre>
          ) : (
            <span className="italic">
              &quot;{firstLine.length > 100 ? firstLine.slice(0, 100) + "..." : firstLine}&quot;
            </span>
          )}
          {hasMoreLines && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-1.5 text-xs text-primary hover:underline inline-flex items-center gap-0.5"
            >
              {expanded ? (
                <>
                  Ver menos <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  Ver más <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Row 4: Timestamp */}
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {isPending && (
          <>
            <Clock className="h-3 w-3" />
            <span>
              Programado: {format(new Date(message.scheduled_for), "dd/MM/yyyy HH:mm", { locale: es })}
            </span>
            <span>·</span>
            <span>
              {formatDistanceToNow(new Date(message.scheduled_for), { addSuffix: true, locale: es })}
            </span>
          </>
        )}
        {isSent && message.sent_at && (
          <>
            <CheckCircle className="h-3 w-3 text-green-600" />
            <span>
              Enviado: {format(new Date(message.sent_at), "dd/MM/yyyy HH:mm", { locale: es })}
            </span>
          </>
        )}
      </div>

      {/* Divider + Actions */}
      {isPending && (
        <>
          <div className="border-t border-border/40" />
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSend}
              variant="outline"
              className="h-8 text-xs border-green-600/40 text-green-700 hover:bg-green-50 hover:text-green-800"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Enviar vía WA
            </Button>
            {editing ? (
              <>
                <Button
                  onClick={handleSaveEdit}
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={saving}
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Guardar
                </Button>
                <Button
                  onClick={() => {
                    setEditing(false)
                    setEditedMessage(message.message)
                  }}
                  variant="ghost"
                  className="h-8 text-xs"
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Cancelar
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setEditing(true)}
                variant="ghost"
                className="h-8 text-xs"
              >
                <Edit className="h-3.5 w-3.5 mr-1.5" />
                Editar
              </Button>
            )}
            <Button
              onClick={onSkip}
              variant="ghost"
              className="h-8 text-xs text-muted-foreground"
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Omitir
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
