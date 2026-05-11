"use client"

import { useEffect } from "react"
import { MessageCircle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SupportHome } from "./support-home"
import { SupportChat } from "./support-chat"
import { SupportArticle } from "./support-article"
import { useState } from "react"

export type WidgetView =
  | { screen: "home" }
  | { screen: "chat" }
  | { screen: "article"; slug: string }

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
        "fixed bottom-24 right-6 z-50 w-[380px] h-[560px] max-h-[80vh]",
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
              {view.screen === "chat" ? "Chat con IA" : "Vibook"}
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
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {view.screen === "home" && <SupportHome onNavigate={setView} />}
        {view.screen === "chat" && <SupportChat />}
        {view.screen === "article" && (
          <SupportArticle
            slug={view.slug}
            onBack={() => setView({ screen: "home" })}
          />
        )}
      </div>
    </div>
  )
}
