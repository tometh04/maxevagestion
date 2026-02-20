"use client"

import { useEffect, useState, useRef } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Bell, ChevronRight, Check, Calendar, DollarSign, FileText, AlertTriangle, CheckSquare, BellRing, BellOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import { toast } from "sonner"
import {
  isPushSubscribed,
  requestPushPermission,
  removePushSubscription,
} from "@/components/notifications/push-notification-manager"

interface Alert {
  id: string
  operation_id: string | null
  type: string
  description: string
  date_due: string
  status: string
  created_at: string
}

const alertTypeConfig: Record<string, { icon: any; color: string }> = {
  PAYMENT_DUE: { icon: DollarSign, color: "text-yellow-500" },
  UPCOMING_TRIP: { icon: Calendar, color: "text-blue-500" },
  MISSING_DOCUMENT: { icon: FileText, color: "text-orange-500" },
  LOW_MARGIN: { icon: AlertTriangle, color: "text-red-500" },
  QUOTATION_EXPIRING: { icon: Bell, color: "text-purple-500" },
  TASK_REMINDER: { icon: CheckSquare, color: "text-indigo-500" },
}

export function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createBrowserClient> | null>(null)

  useEffect(() => {
    // Initialize Supabase client
    supabaseRef.current = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    fetchAlerts()

    // Check push support & status
    const checkPush = async () => {
      const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
      setPushSupported(supported)
      if (supported) {
        const subscribed = await isPushSubscribed()
        setPushEnabled(subscribed)
      }
    }
    checkPush()
  }, [])

  // Supabase Realtime subscription
  useEffect(() => {
    const supabase = supabaseRef.current
    if (!supabase) return

    const channel = supabase
      .channel('alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'alerts',
        },
        (payload: any) => {
          const newAlert = payload.new as Alert
          if (newAlert.status === 'PENDING') {
            setAlerts((prev) => [newAlert, ...prev.slice(0, 9)])
            setUnreadCount((prev) => prev + 1)
            toast.info(`🔔 Nueva alerta: ${newAlert.description.slice(0, 50)}...`, {
              duration: 4000,
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'alerts',
        },
        (payload: any) => {
          const updatedAlert = payload.new as Alert
          if (updatedAlert.status === 'DONE') {
            setAlerts((prev) => prev.filter(a => a.id !== updatedAlert.id))
            setUnreadCount((prev) => Math.max(0, prev - 1))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchAlerts = async () => {
    try {
      const response = await fetch("/api/alerts?status=PENDING&limit=10")
      const data = await response.json()
      setAlerts(data.alerts || [])
      setUnreadCount(data.alerts?.length || 0)
    } catch (error) {
      console.error("Error fetching alerts:", error)
    }
  }

  const markAsDone = async (alertId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      await fetch("/api/alerts/mark-done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      })

      setAlerts((prev) => prev.filter(a => a.id !== alertId))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error("Error marking alert as done:", error)
    }
  }

  const getAlertConfig = (type: string) => {
    return alertTypeConfig[type] || { icon: Bell, color: "text-gray-500" }
  }

  const handleTogglePush = async () => {
    setPushLoading(true)
    try {
      if (pushEnabled) {
        // Desactivar push
        const success = await removePushSubscription()
        if (success) {
          setPushEnabled(false)
          toast.success("Notificaciones push desactivadas")
        } else {
          toast.error("Error al desactivar notificaciones")
        }
      } else {
        // Activar push
        const success = await requestPushPermission()
        if (success) {
          setPushEnabled(true)
          toast.success("Notificaciones push activadas")
        } else {
          if (typeof Notification !== "undefined" && Notification.permission === "denied") {
            toast.error("Las notificaciones están bloqueadas en tu navegador. Desbloqueálas desde la configuración del sitio.")
          } else {
            toast.error("No se pudieron activar las notificaciones")
          }
        }
      }
    } catch (error) {
      console.error("Error toggling push:", error)
      toast.error("Error al cambiar notificaciones")
    } finally {
      setPushLoading(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold text-sm">Notificaciones</h4>
          <Link href="/alerts" onClick={() => setOpen(false)}>
            <Button variant="ghost" size="sm" className="text-xs">
              Ver todas
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>

        <ScrollArea className="h-[300px]">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Sin notificaciones</p>
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map((alert) => {
                const config = getAlertConfig(alert.type)
                const Icon = config.icon

                return (
                  <div
                    key={alert.id}
                    className="p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`h-4 w-4 mt-0.5 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm line-clamp-2">
                          {alert.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(alert.created_at), {
                            addSuffix: true,
                            locale: es
                          })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => markAsDone(alert.id, e)}
                        title="Marcar como completada"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    </div>
                    {alert.operation_id && (
                      <Link
                        href={`/operations/${alert.operation_id}`}
                        onClick={() => setOpen(false)}
                        className="text-xs text-primary hover:underline ml-7 mt-1 block"
                      >
                        Ver operación →
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {/* Push notifications toggle */}
        {pushSupported && (
          <>
            <Separator />
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {pushEnabled ? (
                  <BellRing className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <BellOff className="h-3.5 w-3.5" />
                )}
                <span>
                  Push {pushEnabled ? "activadas" : "desactivadas"}
                </span>
              </div>
              <Button
                variant={pushEnabled ? "outline" : "default"}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={handleTogglePush}
                disabled={pushLoading}
              >
                {pushLoading
                  ? "..."
                  : pushEnabled
                    ? "Desactivar"
                    : "Activar push"}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
