"use client"

import { useEffect, useState, useCallback } from "react"
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

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      fetchAnnouncements()
      // Al abrir, marcamos todas como leídas para limpiar el indicador.
      if (unreadCount > 0) markAllRead()
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Novedades">
          <Megaphone className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
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
