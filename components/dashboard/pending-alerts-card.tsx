"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bell, Calendar, DollarSign, FileText, AlertTriangle, ChevronRight } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
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

export function PendingAlertsCard() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAlerts()
  }, [])

  const fetchAlerts = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/alerts?status=PENDING&limit=5")
      const data = await response.json()
      setAlerts(data.alerts || [])
    } catch (error) {
      console.error("Error fetching alerts:", error)
    } finally {
      setLoading(false)
    }
  }

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

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <div>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alertas Pendientes
          </CardTitle>
          <CardDescription className="text-xs">Requieren atención</CardDescription>
        </div>
        <Link href="/alerts">
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            Ver todas
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Bell className="h-6 w-6 mx-auto mb-1 opacity-50" />
            <p className="text-xs">Sin alertas pendientes</p>
          </div>
        ) : (
          <div className="space-y-2">
              {alerts.map((alert) => {
                const config = getAlertConfig(alert.type)
                const Icon = config.icon
                const overdue = isOverdue(alert.date_due)

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
                
                return (
                  <Link key={alert.id} href={getAlertLink()}>
                    <div
                      className={`p-3 rounded-lg border transition-all cursor-pointer group ${
                        overdue 
                          ? "border-amber-500/50 bg-amber-500/5 dark:border-amber-500/30 dark:bg-amber-500/10 hover:bg-amber-500/10 dark:hover:bg-amber-500/20" 
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${config.color} text-white shrink-0`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-medium text-foreground">
                              {config.label}
                            </span>
                            {overdue && (
                              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-500 hover:bg-amber-600">
                                Vencida
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium text-foreground mb-1 line-clamp-2">
                            {shortDescription}
                          </p>
                          {alert.operations?.file_code && (
                            <p className="text-[10px] text-muted-foreground/60 mb-1">
                              {alert.operations.file_code}
                            </p>
                          )}
                          <span className="text-[10px] text-muted-foreground/70">
                            {formatDistanceToNow(new Date(alert.date_due), { 
                              addSuffix: true,
                              locale: es 
                            })}
                          </span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
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
