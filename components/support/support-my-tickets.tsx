"use client"

import { useState, useEffect } from "react"
import { Loader2, LifeBuoy, ChevronRight, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Ticket {
  id: string
  subject: string
  status: string
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Abierto", variant: "destructive" },
  in_progress: { label: "En progreso", variant: "default" },
  resolved: { label: "Resuelto", variant: "secondary" },
  closed: { label: "Cerrado", variant: "outline" },
}

function formatDate(d: string) {
  const date = new Date(d)
  const now = new Date()
  const diffH = Math.floor((now.getTime() - date.getTime()) / 3600000)
  if (diffH < 1) return "hace momentos"
  if (diffH < 24) return `hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `hace ${diffD}d`
  return date.toLocaleDateString("es-AR", { day: "numeric", month: "short" })
}

interface SupportMyTicketsProps {
  onSelect: (ticketId: string) => void
}

export function SupportMyTickets({ onSelect }: SupportMyTicketsProps) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/support/tickets")
      .then((res) => res.json())
      .then((data) => setTickets(data.tickets || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3">
        <div className="flex items-center gap-2 mb-3 px-1">
          <LifeBuoy className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Mis tickets</h4>
        </div>

        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No tenés tickets creados.
          </p>
        ) : (
          <div className="space-y-1">
            {tickets.map((t) => {
              const cfg = STATUS_LABELS[t.status] || STATUS_LABELS.open
              return (
                <button
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-accent transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate group-hover:text-primary">
                          {t.subject}
                        </p>
                        <Badge variant={cfg.variant} className="text-[9px] px-1.5 py-0 shrink-0">
                          {cfg.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(t.updated_at)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
