"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Bell,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  Clock,
  ExternalLink,
  CheckCheck,
  Trash2,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import { toast } from "sonner"
import { EmptyState } from "@/components/ui/empty-state"

interface Alert {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string
  date_due?: string
  is_resolved: boolean
  created_at: string
  operation_id?: string
  operations?: {
    id: string
    destination: string
    departure_date: string
  }
}

interface NotificationsPageClientProps {
  initialAlerts: Alert[]
  userId: string
}

const severityConfig: Record<string, { icon: any; color: string; bg: string }> = {
  CRITICAL: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-100" },
  WARNING: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-100" },
  INFO: { icon: Info, color: "text-blue-600", bg: "bg-blue-100" },
  SUCCESS: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-100" },
}

const typeLabels: Record<string, string> = {
  PAYMENT_DUE: "Pago por vencer",
  PAYMENT_OVERDUE: "Pago vencido",
  UPCOMING_TRIP: "Viaje próximo",
  MISSING_DOCUMENTS: "Documentos faltantes",
  NEW_OPERATION: "Nueva operación",
  COMMISSION_GENERATED: "Comisión generada",
  GENERAL: "General",
}

export function NotificationsPageClient({
  initialAlerts,
  userId,
}: NotificationsPageClientProps) {
  const [alerts, setAlerts] = useState(initialAlerts)
  const [filter, setFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  const filteredAlerts = alerts.filter((alert) => {
    if (filter === "unread" && alert.is_resolved) return false
    if (filter === "resolved" && !alert.is_resolved) return false
    if (typeFilter !== "all" && alert.alert_type !== typeFilter) return false
    return true
  })

  const unreadCount = alerts.filter((a) => !a.is_resolved).length

  async function markAsResolved(alertId: string) {
    try {
      const response = await fetch(`/api/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_resolved: true }),
      })

      if (!response.ok) throw new Error("Error al actualizar")

      setAlerts(alerts.map((a) => 
        a.id === alertId ? { ...a, is_resolved: true } : a
      ))
      toast.success("Notificación marcada como leída")
    } catch (error) {
      toast.error("Error al actualizar notificación")
    }
  }

  async function markAllAsResolved() {
    try {
      const unreadAlerts = alerts.filter((a) => !a.is_resolved)
      for (const alert of unreadAlerts) {
        await fetch(`/api/alerts/${alert.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_resolved: true }),
        })
      }

      setAlerts(alerts.map((a) => ({ ...a, is_resolved: true })))
      toast.success("Todas las notificaciones marcadas como leídas")
    } catch (error) {
      toast.error("Error al actualizar notificaciones")
    }
  }

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sin leer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unreadCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Críticas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {alerts.filter((a) => a.severity === "CRITICAL" && !a.is_resolved).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Advertencias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {alerts.filter((a) => a.severity === "WARNING" && !a.is_resolved).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alerts.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y acciones */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="unread">
                Sin leer
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="resolved">Leídas</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="PAYMENT_DUE">Pagos por vencer</SelectItem>
              <SelectItem value="PAYMENT_OVERDUE">Pagos vencidos</SelectItem>
              <SelectItem value="UPCOMING_TRIP">Viajes próximos</SelectItem>
              <SelectItem value="MISSING_DOCUMENTS">Documentos faltantes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllAsResolved}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Marcar todas como leídas
          </Button>
        )}
      </div>

      {/* Lista de notificaciones */}
      {filteredAlerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No hay notificaciones"
          description={
            filter === "unread"
              ? "No tienes notificaciones sin leer"
              : "No hay notificaciones que mostrar"
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const config = severityConfig[alert.severity] || severityConfig.INFO
            const Icon = config.icon

            return (
              <Card
                key={alert.id}
                className={`${alert.is_resolved ? "opacity-60" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-full ${config.bg}`}>
                      <Icon className={`h-5 w-5 ${config.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{alert.title}</h3>
                            <Badge variant="outline" className="text-xs">
                              {typeLabels[alert.alert_type] || alert.alert_type}
                            </Badge>
                            {!alert.is_resolved && (
                              <span className="h-2 w-2 rounded-full bg-blue-500" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {alert.message}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {alert.operation_id && (
                            <Link href={`/operations/${alert.operation_id}`}>
                              <Button variant="ghost" size="sm">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                          )}
                          {!alert.is_resolved && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markAsResolved(alert.id)}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(alert.created_at), {
                            addSuffix: true,
                            locale: es,
                          })}
                        </span>
                        {alert.operations && (
                          <span>
                            Operación: {alert.operations.destination}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

