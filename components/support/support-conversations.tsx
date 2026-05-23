"use client"

import { useState, useEffect } from "react"
import { Loader2, MessageCircle, Clock, ChevronRight, AlertCircle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface Conversation {
  id: string
  title: string
  status: string
  created_at: string
  updated_at: string
  message_count: number
  last_message: {
    role: string
    content: string
    created_at: string
  } | null
}

interface SupportConversationsProps {
  onSelect: (conversationId: string) => void
}

export function SupportConversations({ onSelect }: SupportConversationsProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/support/conversations")
      .then((res) => res.json())
      .then((data) => setConversations(data.conversations || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
        <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No tenés conversaciones anteriores.
        </p>
      </div>
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMin < 1) return "Ahora"
    if (diffMin < 60) return `Hace ${diffMin}min`
    if (diffHours < 24) return `Hace ${diffHours}h`
    if (diffDays < 7) return `Hace ${diffDays}d`
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" })
  }

  const statusIcon = (status: string) => {
    if (status === "escalated") return <AlertCircle className="h-3 w-3 text-orange-500" />
    if (status === "resolved") return <MessageCircle className="h-3 w-3 text-green-500" />
    return <MessageCircle className="h-3 w-3 text-muted-foreground" />
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-0.5">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-accent transition-colors group"
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-1 shrink-0">{statusIcon(conv.status)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate group-hover:text-primary">
                    {conv.title}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {formatDate(conv.updated_at)}
                  </span>
                </div>
                {conv.last_message && (
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {conv.last_message.role === "assistant" ? "IA: " : "Vos: "}
                    {conv.last_message.content}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    {conv.message_count} mensajes
                  </span>
                  {conv.status === "escalated" && (
                    <span className="text-[10px] text-orange-500 font-medium">
                      Escalado
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0" />
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}
