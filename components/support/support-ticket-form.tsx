"use client"

import { useState, useRef } from "react"
import {
  ArrowLeft, Send, Loader2, CheckCircle2, Bug, Lightbulb, HelpCircle,
  Paperclip, X, FileText, ImageIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface SupportTicketFormProps {
  conversationId?: string | null
  onBack: () => void
}

type TicketType = "question" | "bug" | "improvement"

const TICKET_TYPES: { value: TicketType; label: string; icon: typeof Bug; placeholder: string }[] = [
  { value: "question", label: "Consulta", icon: HelpCircle, placeholder: "Ej: ¿Cómo registro un cobro parcial?" },
  { value: "bug", label: "Bug", icon: Bug, placeholder: "Ej: No puedo registrar un cobro, tira error" },
  { value: "improvement", label: "Mejora", icon: Lightbulb, placeholder: "Ej: Me gustaría exportar operaciones a Excel" },
]

interface Attachment {
  name: string
  url: string
  type: string
  size: number
}

const MAX_ATTACHMENTS = 5

export function SupportTicketForm({ conversationId, onBack }: SupportTicketFormProps) {
  const [type, setType] = useState<TicketType>("question")
  const [subject, setSubject] = useState("")
  const [description, setDescription] = useState("")
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const activeType = TICKET_TYPES.find((t) => t.value === type) ?? TICKET_TYPES[0]

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError("")

    const room = MAX_ATTACHMENTS - attachments.length
    if (room <= 0) {
      setError(`Máximo ${MAX_ATTACHMENTS} adjuntos.`)
      return
    }

    setUploading(true)
    for (const file of Array.from(files).slice(0, room)) {
      try {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/support/attachments", { method: "POST", body: fd })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || `No pudimos subir ${file.name}`)
          continue
        }
        setAttachments((prev) => [...prev, data.attachment])
      } catch {
        setError(`No pudimos subir ${file.name}`)
      }
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const removeAttachment = (url: string) => {
    setAttachments((prev) => prev.filter((a) => a.url !== url))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim()) return

    setSending(true)
    setError("")

    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          subject: subject.trim(),
          description: description.trim() || undefined,
          conversationId: conversationId || undefined,
          attachments,
        }),
      })

      if (!res.ok) throw new Error("Error al crear ticket")
      setSent(true)
    } catch {
      setError("No pudimos crear el ticket. Intentá de nuevo.")
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-sm mb-1">Ticket creado</h3>
          <p className="text-xs text-muted-foreground">
            Nuestro equipo va a revisarlo y te contactamos a la brevedad.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>
          Volver al inicio
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors mb-2"
        >
          <ArrowLeft className="h-3 w-3" />
          Volver
        </button>
        <h3 className="text-sm font-semibold">Crear ticket de soporte</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Nuestro equipo te va a contactar por email.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 p-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Tipo *
          </label>
          <div className="grid grid-cols-3 gap-2">
            {TICKET_TYPES.map((t) => {
              const Icon = t.icon
              const selected = type === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border py-2 text-xs transition-colors",
                    selected
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-input text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Asunto *
          </label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={activeType.placeholder}
            className="h-9 text-sm"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Descripción
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Contanos con más detalle qué necesitás..."
            className="min-h-[100px] text-sm resize-none"
            rows={4}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Adjuntos <span className="font-normal">(opcional)</span>
          </label>

          {attachments.length > 0 && (
            <ul className="space-y-1 mb-2">
              {attachments.map((a) => (
                <li
                  key={a.url}
                  className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                >
                  {a.type.startsWith("image/") ? (
                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate flex-1">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.url)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    aria-label="Quitar adjunto"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {attachments.length < MAX_ATTACHMENTS && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 mr-2" />
                )}
                {uploading ? "Subiendo..." : "Adjuntar captura o archivo"}
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1">
                JPG, PNG, WebP, GIF o PDF · hasta 10MB · máx {MAX_ATTACHMENTS}
              </p>
            </>
          )}
        </div>

        {conversationId && (
          <p className="text-[11px] text-muted-foreground">
            Se adjunta la conversación con el asistente de IA como referencia.
          </p>
        )}

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={!subject.trim() || sending || uploading}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Enviar ticket
        </Button>
      </form>
    </div>
  )
}
