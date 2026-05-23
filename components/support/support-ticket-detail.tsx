"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  ArrowLeft, Send, Loader2, Bot, User, ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface Reply {
  id: string
  author_role: "user" | "admin"
  content: string
  created_at: string
}

interface Ticket {
  id: string
  subject: string
  description: string
  status: string
  created_at: string
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Abierto", variant: "destructive" },
  in_progress: { label: "En progreso", variant: "default" },
  resolved: { label: "Resuelto", variant: "secondary" },
  closed: { label: "Cerrado", variant: "outline" },
}

function formatTime(d: string) {
  return new Date(d).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

interface SupportTicketDetailProps {
  ticketId: string
  onBack: () => void
}

export function SupportTicketDetail({ ticketId, onBack }: SupportTicketDetailProps) {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/replies`)
      const data = await res.json()
      setTicket(data.ticket)
      setReplies(data.replies || [])
    } catch {}
    setLoading(false)
  }, [ticketId])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]")
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [replies])

  const sendReply = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.trim() }),
      })
      const data = await res.json()
      if (data.reply) {
        setReplies((prev) => [...prev, data.reply])
        setInput("")
      }
    } catch {}
    setSending(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Ticket no encontrado
      </div>
    )
  }

  const statusCfg = STATUS_LABELS[ticket.status] || STATUS_LABELS.open

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b space-y-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Volver a mis tickets
        </button>
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold truncate flex-1">{ticket.subject}</h4>
          <Badge variant={statusCfg.variant} className="text-[10px] shrink-0">
            {statusCfg.label}
          </Badge>
        </div>
        {ticket.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">{ticket.description}</p>
        )}
      </div>

      {/* Replies */}
      <ScrollArea className="flex-1 px-3" ref={scrollRef}>
        <div className="py-3 space-y-3">
          {replies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nuestro equipo va a responder pronto.
            </p>
          ) : (
            replies.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "flex gap-2",
                  r.author_role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {r.author_role === "admin" && (
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className="min-w-0 max-w-[85%]">
                  <div
                    className={cn(
                      "rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                      r.author_role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {r.content}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
                    {r.author_role === "admin" ? "Soporte" : "Vos"} · {formatTime(r.created_at)}
                  </p>
                </div>
                {r.author_role === "user" && (
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      {ticket.status !== "closed" && (
        <div className="p-3 border-t">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribí tu respuesta..."
              className="min-h-[40px] max-h-[100px] resize-none text-sm"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  sendReply()
                }
              }}
            />
            <Button
              size="icon"
              onClick={sendReply}
              disabled={!input.trim() || sending}
              className="h-10 w-10 shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
