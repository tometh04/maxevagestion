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
    file_code: string
    destination: string
  } | null
}

const alertTypeConfig: Record<string, { icon: any; color: string; label: string }> = {
  PAYMENT_DUE: { icon: DollarSign, color: "bg-yellow-500", label: "Pago Pendiente" },
  UPCOMING_TRIP: { icon: Calendar, color: "bg-blue-500", label: "Viaje Próximo" },
  MISSING_DOCUMENT: { icon: FileText, color: "bg-orange-500", label: "Doc. Faltante" },
  LOW_MARGIN: { icon: AlertTriangle, color: "bg-red-500", label: "Margen Bajo" },
  QUOTATION_EXPIRING: { icon: Bell, color: "bg-purple-500", label: "Cotización Vence" },
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alertas Pendientes
          </CardTitle>
          <CardDescription>Requieren atención</CardDescription>
        </div>
        <Link href="/alerts">
          <Button variant="ghost" size="sm">
            Ver todas
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay alertas pendientes</p>
          </div>
        ) : (
          <ScrollArea className="h-[280px] pr-3">
            <div className="space-y-3">
              {alerts.map((alert) => {
                const config = getAlertConfig(alert.type)
                const Icon = config.icon
                const overdue = isOverdue(alert.date_due)

                return (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border ${overdue ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20" : "border-border"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${config.color} text-white`}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {config.label}
                          </Badge>
                          {overdue && (
                            <Badge variant="destructive" className="text-xs">
                              Vencida
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {alert.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          {alert.operations?.file_code && (
                            <span className="font-mono">{alert.operations.file_code}</span>
                          )}
                          <span>•</span>
                          <span>
                            {formatDistanceToNow(new Date(alert.date_due), { 
                              addSuffix: true,
                              locale: es 
                            })}
                          </span>
                        </div>
                      </div>
                      {alert.operation_id && (
                        <Link href={`/operations/${alert.operation_id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

