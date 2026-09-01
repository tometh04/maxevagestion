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

const TICKET_TYPES: {
  value: TicketType
  label: string
  hint: string
  icon: typeof Bug
  placeholder: string
}[] = [
  {
    value: "question",
    label: "Tengo una duda",
    hint: "No sé cómo hacer algo en el sistema",
    icon: HelpCircle,
    placeholder: "Ej: ¿Cómo registro un cobro parcial?",
  },
  {
    value: "bug",
    label: "Algo no funciona",
    hint: "Me da error, no carga o muestra datos mal",
    icon: Bug,
    placeholder: "Ej: No puedo registrar un cobro, me tira error",
  },
  {
    value: "improvement",
    label: "Se me ocurre una idea",
    hint: "Algo que te gustaría que el sistema haga",
    icon: Lightbulb,
    placeholder: "Ej: Me gustaría exportar operaciones a Excel",
  },
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
      setError(`Podés subir hasta ${MAX_ATTACHMENTS} archivos.`)
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

      if (!res.ok) throw new Error("Error al crear el mensaje de soporte")
      setSent(true)
    } catch {
      setError("No pudimos enviar tu mensaje. Probá de nuevo.")
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
          <h3 className="font-semibold text-sm mb-1">Listo, recibimos tu mensaje</h3>
          <p className="text-xs text-muted-foreground">
            Nuestro equipo lo va a revisar y te responde acá. Podés seguirlo
            desde &ldquo;Mis mensajes&rdquo;.
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
        <h3 className="text-sm font-semibold">Escribile al equipo de soporte</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Te contestamos acá mismo, en esta conversación.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        {/* Contenido scrolleable: el botón de enviar queda fijo abajo */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            ¿Qué querés contarnos? *
          </label>
          <div className="space-y-1.5">
            {TICKET_TYPES.map((t) => {
              const Icon = t.icon
              const selected = type === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  aria-pressed={selected}
                  className={cn(
                    "w-full flex items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-input hover:bg-accent"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 mt-0.5 shrink-0",
                      selected ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-xs font-medium",
                        selected ? "text-primary" : "text-foreground"
                      )}
                    >
                      {t.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {t.hint}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            En pocas palabras, ¿qué pasó? *
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
            Contanos con más detalle
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="¿En qué pantalla estabas? ¿Qué esperabas que pasara? Cuanto más nos cuentes, más rápido te ayudamos."
            className="min-h-[100px] text-sm resize-none"
            rows={4}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Fotos o archivos <span className="font-normal">(opcional)</span>
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
                {uploading ? "Subiendo..." : "Subir una captura de pantalla o archivo"}
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1">
                Imágenes o PDF · hasta 10MB cada uno · máximo {MAX_ATTACHMENTS} archivos
              </p>
            </>
          )}
        </div>

        {conversationId && (
          <p className="text-[11px] text-muted-foreground">
            Le pasamos al equipo tu charla con el asistente, así no tenés que
            repetir todo.
          </p>
        )}
        </div>

        {/* Footer fijo: siempre visible aunque el form scrollee */}
        <div className="shrink-0 border-t p-3 space-y-2 bg-background">
          {error && <p className="text-xs text-destructive">{error}</p>}

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
            Enviar a soporte
          </Button>
        </div>
      </form>
    </div>
  )
}
