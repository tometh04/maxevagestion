"use client"

import { useState, useEffect } from "react"
import { MessageCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SupportHome } from "./support-home"
import { SupportChat } from "./support-chat"
import { SupportArticle } from "./support-article"

export type WidgetView =
  | { screen: "home" }
  | { screen: "chat"; conversationId?: string }
  | { screen: "article"; slug: string }
  | { screen: "conversations" }
  | { screen: "ticket"; conversationId?: string }
  | { screen: "my-tickets" }
  | { screen: "ticket-detail"; ticketId: string }

export function SupportWidget() {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<WidgetView>({ screen: "home" })

  // Cerrar con Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false)
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open])

  return (
    <>
      {/* Panel */}
      {open && (
        <div
          className={cn(
            "fixed bottom-20 right-4 z-50 w-[380px] h-[560px] max-h-[80vh]",
            "bg-background border rounded-xl shadow-2xl",
            "flex flex-col overflow-hidden",
            "animate-in slide-in-from-bottom-4 fade-in duration-200"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground rounded-t-xl">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              <div>
                <h3 className="font-semibold text-sm">Centro de Ayuda</h3>
                <p className="text-xs opacity-80">
                  {view.screen === "chat"
                    ? "Chat con IA"
                    : "Vibook"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {view.screen !== "home" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-primary-foreground hover:bg-primary/80 text-xs"
                  onClick={() => setView({ screen: "home" })}
                >
                  Inicio
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary-foreground hover:bg-primary/80"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden">
            {view.screen === "home" && (
              <SupportHome onNavigate={setView} />
            )}
            {view.screen === "chat" && <SupportChat />}
            {view.screen === "article" && (
              <SupportArticle
                slug={view.slug}
                onBack={() => setView({ screen: "home" })}
              />
            )}
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "fixed bottom-4 right-4 z-50",
          "h-14 w-14 rounded-full shadow-lg",
          "bg-primary text-primary-foreground",
          "flex items-center justify-center",
          "hover:scale-105 active:scale-95 transition-transform",
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
        )}
        aria-label={open ? "Cerrar centro de ayuda" : "Abrir centro de ayuda"}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>
    </>
  )
}
