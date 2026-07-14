"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Megaphone, Sparkles, TrendingUp, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

interface Announcement {
  id: string
  title: string
  body: string
  type: "NEW" | "IMPROVEMENT" | "FIX"
  published_at: string
  read: boolean
}

const typeConfig: Record<
  Announcement["type"],
  { label: string; icon: typeof Sparkles; className: string }
> = {
  NEW: {
    label: "Nuevo",
    icon: Sparkles,
    className: "bg-success/10 text-success border-success/20",
  },
  IMPROVEMENT: {
    label: "Mejora",
    icon: TrendingUp,
    className: "bg-primary/10 text-primary border-primary/20",
  },
  FIX: {
    label: "Corrección",
    icon: Wrench,
    className: "bg-accent-coral/10 text-accent-coral border-accent-coral/20",
  },
}

export function AnnouncementsBell() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  // "Llamador": globito que aparece cuando hay novedades sin leer y se
  // desvanece solo a los ~6s (o al abrir/clickear). Se muestra una sola vez
  // por sesión para no ser molesto en cada polling.
  const [showCallout, setShowCallout] = useState(false)
  const calloutShownRef = useRef(false)

  const fetchAnnouncements = useCallback(async () => {
    try {
      const response = await fetch("/api/announcements")
      const data = await response.json()
      setAnnouncements(data.announcements || [])
      setUnreadCount(data.unreadCount || 0)
    } catch (error) {
      console.error("Error fetching announcements:", error)
    }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await fetch("/api/announcements/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      setAnnouncements((prev) => prev.map((a) => ({ ...a, read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error("Error marking announcements as read:", error)
    }
  }, [])

  useEffect(() => {
    fetchAnnouncements()
    // Polling cada 60s — las novedades las publica un admin, no requieren realtime.
    const interval = setInterval(fetchAnnouncements, 60_000)
    return () => clearInterval(interval)
  }, [fetchAnnouncements])

  // Mostrar el llamador una sola vez cuando se detectan novedades sin leer.
  useEffect(() => {
    if (unreadCount > 0 && !open && !calloutShownRef.current) {
      calloutShownRef.current = true
      setShowCallout(true)
      const t = setTimeout(() => setShowCallout(false), 6000)
      return () => clearTimeout(t)
    }
  }, [unreadCount, open])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setShowCallout(false)
      fetchAnnouncements()
      // Al abrir, marcamos todas como leídas para limpiar el indicador.
      if (unreadCount > 0) markAllRead()
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            title="Novedades"
          >
            {/* Halo pulsante cuando hay novedades sin leer */}
            {unreadCount > 0 && !open && (
              <span className="absolute inset-0 rounded-full bg-primary/25 animate-ping" />
            )}
            <Megaphone className={`h-5 w-5 relative ${unreadCount > 0 && !open ? "text-primary" : ""}`} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
            )}
          </Button>
        </PopoverTrigger>

        {/* Llamador: globito que invita a abrir las novedades */}
        {showCallout && unreadCount > 0 && !open && (
          <button
            type="button"
            onClick={() => handleOpenChange(true)}
            className="absolute right-0 top-full mt-2 z-50 flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg animate-in fade-in slide-in-from-top-1 duration-300"
          >
            <span
              className="absolute -top-1 right-3 h-2 w-2 rotate-45 bg-primary"
              aria-hidden="true"
            />
            <Sparkles className="h-3.5 w-3.5" />
            ¡Hay novedades! Mirá acá
          </button>
        )}
      </div>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
          <Sparkles className="h-4 w-4 text-primary" />
          <h4 className="font-semibold text-sm">Novedades</h4>
        </div>

        <ScrollArea className="h-[320px]">
          {announcements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Megaphone className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No hay novedades</p>
            </div>
          ) : (
            <div className="divide-y">
              {announcements.map((a) => {
                const config = typeConfig[a.type] || typeConfig.NEW
                const Icon = config.icon
                return (
                  <div key={a.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className={`gap-1 text-[10px] px-1.5 py-0 h-5 ${config.className}`}
                      >
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                      {!a.read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                      )}
                    </div>
                    <p className="text-sm font-medium leading-snug">{a.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap leading-snug">
                      {a.body}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {formatDistanceToNow(new Date(a.published_at), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
