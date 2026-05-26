"use client"

import { useEffect } from "react"
import { X, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SupportHome } from "./support-home"
import { SupportChat } from "./support-chat"
import { SupportArticle } from "./support-article"
import { SupportConversations } from "./support-conversations"
import { SupportTicketForm } from "./support-ticket-form"
import { SupportMyTickets } from "./support-my-tickets"
import { SupportTicketDetail } from "./support-ticket-detail"
import { useState } from "react"

export type WidgetView =
  | { screen: "home" }
  | { screen: "chat"; conversationId?: string }
  | { screen: "article"; slug: string }
  | { screen: "conversations" }
  | { screen: "ticket"; conversationId?: string }
  | { screen: "my-tickets" }
  | { screen: "ticket-detail"; ticketId: string }

const SCREEN_TITLES: Record<string, string> = {
  home: "Vibook",
  chat: "Chat con IA",
  article: "Artículo",
  conversations: "Historial",
  ticket: "Nuevo ticket",
  "my-tickets": "Mis tickets",
  "ticket-detail": "Ticket",
}

interface SupportPanelProps {
  open: boolean
  onClose: () => void
}

export function SupportPanel({ open, onClose }: SupportPanelProps) {
  const [view, setView] = useState<WidgetView>({ screen: "home" })

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      // Delay reset para que la animación de salida se complete
      const t = setTimeout(() => setView({ screen: "home" }), 200)
      return () => clearTimeout(t)
    }
  }, [open])

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={cn(
        "fixed bottom-24 right-6 z-50 w-[400px] h-[600px] max-h-[85vh]",
        "bg-background border rounded-2xl shadow-2xl",
        "flex flex-col overflow-hidden",
        "animate-in slide-in-from-bottom-4 fade-in duration-200"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Centro de Ayuda</h3>
            <p className="text-[11px] opacity-80">
              {SCREEN_TITLES[view.screen] || "Vibook"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {view.screen !== "home" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-primary-foreground hover:bg-white/20 text-xs"
              onClick={() => setView({ screen: "home" })}
            >
              Inicio
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary-foreground hover:bg-white/20"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {view.screen === "home" && <SupportHome onNavigate={setView} />}
        {view.screen === "chat" && (
          <SupportChat
            conversationId={view.conversationId}
            onConversationCreated={(id) =>
              setView({ screen: "chat", conversationId: id })
            }
            onEscalate={(convId) =>
              setView({ screen: "ticket", conversationId: convId })
            }
          />
        )}
        {view.screen === "article" && (
          <SupportArticle
            slug={view.slug}
            onBack={() => setView({ screen: "home" })}
          />
        )}
        {view.screen === "conversations" && (
          <SupportConversations
            onSelect={(id) =>
              setView({ screen: "chat", conversationId: id })
            }
          />
        )}
        {view.screen === "ticket" && (
          <SupportTicketForm
            conversationId={view.conversationId}
            onBack={() => setView({ screen: "home" })}
          />
        )}
        {view.screen === "my-tickets" && (
          <SupportMyTickets
            onSelect={(ticketId) =>
              setView({ screen: "ticket-detail", ticketId })
            }
          />
        )}
        {view.screen === "ticket-detail" && (
          <SupportTicketDetail
            ticketId={view.ticketId}
            onBack={() => setView({ screen: "my-tickets" })}
          />
        )}
      </div>
    </div>
  )
}
