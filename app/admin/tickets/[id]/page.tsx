"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft, Send, Loader2, User, ShieldCheck, Building2,
  Mail, Clock, LifeBuoy,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface Reply {
  id: string
  author_role: "user" | "admin"
  content: string
  created_at: string
}

interface TicketDetail {
  id: string
  subject: string
  description: string
  status: string
  created_at: string
  updated_at: string
  user_email: string
  user_name: string | null
  org_name: string | null
}

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  in_progress: "En progreso",
  resolved: "Resuelto",
  closed: "Cerrado",
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

export default function AdminTicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [replies, setReplies] = useState<Reply[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchTicket = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}/replies`)
      const data = await res.json()
      setTicket(data.ticket)
      setReplies(data.replies || [])
    } catch {}
    setLoading(false)
  }, [id])

  useEffect(() => { fetchTicket() }, [fetchTicket])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [replies])

  const sendReply = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: input.trim() }),
      })
      const data = await res.json()
      if (data.reply) {
        setReplies((prev) => [...prev, data.reply])
        setInput("")
        if (ticket?.status === "open") {
          setTicket((prev) => prev ? { ...prev, status: "in_progress" } : prev)
        }
      }
    } catch {}
    setSending(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!ticket) {
    return <p className="text-center py-20 text-muted-foreground">Ticket no encontrado</p>
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => router.push("/admin/tickets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">{ticket.subject}</h1>
            <Badge variant={ticket.status === "open" ? "destructive" : "secondary"}>
              {STATUS_LABELS[ticket.status] || ticket.status}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              {ticket.user_name || ticket.user_email}
            </span>
            {ticket.org_name && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {ticket.org_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(ticket.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      {ticket.description && (
        <div className="border rounded-lg p-4 mb-4 bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Descripción original</p>
          <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
        </div>
      )}

      {/* Replies thread */}
      <div
        ref={scrollRef}
        className="border rounded-lg p-4 mb-4 space-y-4 max-h-[400px] overflow-y-auto"
      >
        {replies.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Sin respuestas todavía. Escribí tu respuesta abajo.
          </p>
        ) : (
          replies.map((r) => (
            <div key={r.id} className={cn("flex gap-3", r.author_role === "admin" ? "justify-end" : "")}>
              {r.author_role === "user" && (
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div
                className={cn(
                  "rounded-xl px-4 py-2.5 text-sm max-w-[80%] whitespace-pre-wrap",
                  r.author_role === "admin"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <p>{r.content}</p>
                <p className={cn(
                  "text-[10px] mt-1",
                  r.author_role === "admin" ? "text-primary-foreground/60" : "text-muted-foreground"
                )}>
                  {formatDate(r.created_at)}
                </p>
              </div>
              {r.author_role === "admin" && (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Reply input */}
      <div className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribí tu respuesta..."
          className="min-h-[80px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              sendReply()
            }
          }}
        />
        <Button onClick={sendReply} disabled={!input.trim() || sending} className="shrink-0">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
