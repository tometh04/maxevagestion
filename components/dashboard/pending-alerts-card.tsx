"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Bell, Calendar, DollarSign, FileText, AlertTriangle, ChevronRight } from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"

interface Alert {
  id: string
  operation_id: string | null
  type: string
  description: string
  date_due: string
  status: string
  operations?: {
    id: string
    file_code?: string
    destination?: string
  } | null
}

const alertTypeConfig: Record<string, { icon: any; color: string; label: string }> = {
  PAYMENT_DUE: { icon: DollarSign, color: "bg-amber-500", label: "Pago" },
  UPCOMING_TRIP: { icon: Calendar, color: "bg-blue-500", label: "Viaje" },
  MISSING_DOCUMENT: { icon: FileText, color: "bg-orange-500", label: "Doc" },
  LOW_MARGIN: { icon: AlertTriangle, color: "bg-red-500", label: "Margen" },
  QUOTATION_EXPIRING: { icon: Bell, color: "bg-purple-500", label: "Cotiz" },
  RECURRING_PAYMENT: { icon: DollarSign, color: "bg-emerald-500", label: "Recurrente" },
}

interface PendingAlertsCardProps {
  agencyId?: string
  sellerId?: string
}

export function PendingAlertsCard({ agencyId, sellerId }: PendingAlertsCardProps = {}) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set("status", "PENDING")
      params.set("limit", "10")
      if (agencyId && agencyId !== "ALL") {
        params.set("agencyId", agencyId)
      }
      if (sellerId && sellerId !== "ALL") {
        params.set("sellerId", sellerId)
      }
      
      const response = await fetch(`/api/alerts?${params.toString()}`)
      const data = await response.json()
      const allAlerts = data.alerts || []
      // Filtrar solo alertas vencidas
      const overdueAlerts = allAlerts.filter((alert: Alert) => isOverdue(alert.date_due))
      // Limitar a 3
      setAlerts(overdueAlerts.slice(0, 3))
    } catch (error) {
      console.error("Error fetching alerts:", error)
    } finally {
      setLoading(false)
    }
  }, [agencyId, sellerId])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  const getAlertConfig = (type: string) => {
    return alertTypeConfig[type] || { icon: Bell, color: "bg-gray-500", label: type }
  }

  const isOverdue = (dateStr: string) => {
    return new Date(dateStr) < new Date()
  }

  // Extraer información esencial de la descripción
  const parseAlertDescription = (description: string, operation?: { destination?: string; file_code?: string }) => {
    // Si hay operación con destino, usarlo
    if (operation?.destination) {
      return operation.destination
    }
    
    // Intentar extraer destino de la descripción
    const destinationMatch = description.match(/:\s*([^-]+?)\s*-/)
    if (destinationMatch) {
      return destinationMatch[1].trim()
    }
    
    // Si no, devolver una versión corta de la descripción
    if (description.length > 30) {
      return description.substring(0, 30) + "..."
    }
    return description
  }

  // Extraer tipo de alerta más descriptivo de la descripción
  const getAlertTypeInfo = (description: string, type: string) => {
    if (description.includes("Check-out")) {
      return "Check-out próximo"
    }
    if (description.includes("Check-in")) {
      return "Check-in próximo"
    }
    if (description.includes("Pago")) {
      return "Pago pendiente"
    }
    if (description.includes("Documento")) {
      return "Documento faltante"
    }
    if (description.includes("Pasaporte")) {
      return "Pasaporte"
    }
    return alertTypeConfig[type]?.label || type
  }

  // Formatear fecha de vencimiento
  const formatDueDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return format(date, "dd/MM/yyyy", { locale: es })
    } catch {
      return ""
    }
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <div>
          <CardTitle className="text-xs font-medium flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Alertas Vencidas
          </CardTitle>
          <CardDescription className="text-[10px]">Requieren atención urgente</CardDescription>
        </div>
        <Link href="/alerts">
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
            Ver todas
            <ChevronRight className="h-2.5 w-2.5 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-1.5">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-3 text-muted-foreground">
            <Bell className="h-4 w-4 mx-auto mb-1 opacity-50" />
            <p className="text-[10px]">Sin alertas vencidas</p>
          </div>
        ) : (
          <div className="space-y-1.5">
              {alerts.map((alert) => {
                const config = getAlertConfig(alert.type)
                const Icon = config.icon

                // Determinar el link correcto según el tipo de alerta y si tiene operation válida
                const getAlertLink = () => {
                  // Si tiene operación con datos válidos, ir al detalle
                  if (alert.operation_id && alert.operations?.id) {
                    return `/operations/${alert.operation_id}`
                  }
                  // Si no, ir a la lista de alertas
                  return "/alerts"
                }

                const shortDescription = parseAlertDescription(alert.description, alert.operations || undefined)
                const alertTypeInfo = getAlertTypeInfo(alert.description, alert.type)
                const dueDate = formatDueDate(alert.date_due)

                return (
                  <Link key={alert.id} href={getAlertLink()} prefetch={false}>
                    <div
                      className="p-2 rounded border border-amber-500/50 bg-amber-500/5 dark:border-amber-500/30 dark:bg-amber-500/10 hover:bg-amber-500/10 dark:hover:bg-amber-500/20 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-start gap-2">
                        <div className={`p-1 rounded ${config.color} text-white shrink-0 mt-0.5`}>
                          <Icon className="h-2.5 w-2.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-medium text-foreground">
                              {alertTypeInfo}
                            </span>
                            <Badge className="text-[9px] px-1 py-0 h-3.5 bg-amber-500 hover:bg-amber-600">
                              Vencida
                            </Badge>
                          </div>
                          <p className="text-[11px] font-semibold text-foreground mb-0.5">
                            {shortDescription}
                          </p>
                          <div className="flex items-center gap-2 text-[9px] text-muted-foreground/70">
                            {alert.operations?.file_code && (
                              <span className="truncate">{alert.operations.file_code}</span>
                            )}
                            {dueDate && (
                              <span className="shrink-0">Vence: {dueDate}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
        )}
      </CardContent>
    </Card>
  )
}
