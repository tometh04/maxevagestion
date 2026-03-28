"use client"

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { format, differenceInDays, isToday, isTomorrow, isBefore, startOfDay, endOfWeek, isAfter } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import {
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  X,
  DollarSign,
  Plane,
  FileText,
  Bell,
  AlertTriangle,
  Cake,
  ShieldAlert,
  ClipboardList,
  ArrowRight,
  Clock,
} from "lucide-react"

export interface Alert {
  id: string
  operation_id: string | null
  lead_id?: string | null
  customer_id: string | null
  user_id: string | null
  type: string
  description: string
  date_due: string
  status: "PENDING" | "DONE" | "IGNORED"
  operations?: {
    id: string
    destination: string
    agency_id: string
    seller_id: string
    departure_date: string
    agencies?: {
      id: string
      name: string
    } | null
  } | null
  leads?: {
    id: string
    contact_name: string
    destination: string
  } | null
  customers?: {
    id: string
    first_name: string
    last_name: string
  } | null
  whatsapp_messages?: Array<{
    id: string
    message: string
    whatsapp_link: string
    status: string
    scheduled_for: string
    phone: string
    customer_name: string
  }> | null
}

interface AlertsTableProps {
  alerts: Alert[]
  isLoading?: boolean
  onMarkDone?: (alertId: string) => void
  onIgnore?: (alertId: string) => void
  emptyMessage?: string
}

const typeLabels: Record<string, string> = {
  PAYMENT_DUE: "Pago Pendiente",
  OPERATOR_DUE: "Pago Operador",
  UPCOMING_TRIP: "Viaje",
  MISSING_DOC: "Documento Faltante",
  GENERIC: "Generico",
  PAYMENT_REMINDER_7D: "Pago (7 dias)",
  PAYMENT_REMINDER_3D: "Pago (3 dias)",
  PAYMENT_REMINDER_TODAY: "Pago (Hoy)",
  PAYMENT_OVERDUE: "Pago Vencido",
  LEAD_CHECKIN_30D: "Check-in (30 dias)",
  LEAD_CHECKIN_15D: "Check-in (15 dias)",
  LEAD_CHECKIN_7D: "Check-in (7 dias)",
  LEAD_CHECKIN_TODAY: "Check-in (Hoy)",
  RECURRING_PAYMENT: "Pago Recurrente",
  PASSPORT_EXPIRY: "Pasaporte",
  DESTINATION_REQUIREMENT: "Requisito",
  BIRTHDAY: "Cumpleanos",
  TASK_REMINDER: "Tarea",
}

const statusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  DONE: "Resuelto",
  IGNORED: "Ignorado",
}

function getTypeIcon(type: string) {
  if (type.includes("PAYMENT") || type.includes("OPERATOR_DUE") || type.includes("RECURRING")) {
    return <DollarSign className="h-3.5 w-3.5" />
  }
  if (type.includes("TRIP")) return <Plane className="h-3.5 w-3.5" />
  if (type.includes("DOC") || type.includes("REQUIREMENT")) return <FileText className="h-3.5 w-3.5" />
  if (type.includes("LEAD") || type.includes("CHECKIN")) return <ClipboardList className="h-3.5 w-3.5" />
  if (type.includes("PASSPORT")) return <ShieldAlert className="h-3.5 w-3.5" />
  if (type.includes("BIRTHDAY")) return <Cake className="h-3.5 w-3.5" />
  if (type.includes("TASK")) return <ClipboardList className="h-3.5 w-3.5" />
  return <Bell className="h-3.5 w-3.5" />
}

type UrgencyLevel = "overdue" | "today" | "this_week" | "upcoming"

function getUrgency(dateDue: string): UrgencyLevel {
  const now = new Date()
  const todayStart = startOfDay(now)
  const due = new Date(dateDue)
  const dueDay = startOfDay(due)
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

  if (isBefore(dueDay, todayStart)) return "overdue"
  if (isToday(due)) return "today"
  if (!isAfter(dueDay, weekEnd)) return "this_week"
  return "upcoming"
}

const urgencyConfig: Record<UrgencyLevel, { border: string; bg: string; label: string }> = {
  overdue: { border: "border-l-red-500", bg: "bg-red-500/5", label: "Vencidas" },
  today: { border: "border-l-amber-500", bg: "bg-amber-500/5", label: "Hoy" },
  this_week: { border: "border-l-blue-500", bg: "bg-blue-500/5", label: "Esta semana" },
  upcoming: { border: "border-l-border", bg: "", label: "Proximas" },
}

function getRelativeDate(dateDue: string): string {
  const due = new Date(dateDue)
  const now = new Date()
  const diff = differenceInDays(startOfDay(due), startOfDay(now))

  if (diff < -1) return `Vencido hace ${Math.abs(diff)} dias`
  if (diff === -1) return "Vencido ayer"
  if (diff === 0) return "Hoy"
  if (diff === 1) return "Manana"
  if (diff <= 7) return `En ${diff} dias`
  return format(due, "dd MMM yyyy", { locale: es })
}

function getRelativeDateColor(dateDue: string): string {
  const due = new Date(dateDue)
  const now = new Date()
  const diff = differenceInDays(startOfDay(due), startOfDay(now))

  if (diff < 0) return "text-red-600 font-medium"
  if (diff === 0) return "text-amber-600 font-medium"
  if (diff <= 3) return "text-blue-600"
  return "text-muted-foreground"
}

interface GroupedAlerts {
  level: UrgencyLevel
  alerts: Alert[]
}

export function AlertsTable({
  alerts,
  isLoading = false,
  onMarkDone,
  onIgnore,
  emptyMessage,
}: AlertsTableProps) {
  // Group alerts by urgency for pending, show others ungrouped
  const groupedAlerts = useMemo((): GroupedAlerts[] => {
    const groups: Record<UrgencyLevel, Alert[]> = {
      overdue: [],
      today: [],
      this_week: [],
      upcoming: [],
    }

    for (const alert of alerts) {
      if (alert.status === "PENDING") {
        const urgency = getUrgency(alert.date_due)
        groups[urgency].push(alert)
      } else {
        // Non-pending alerts go to upcoming (bottom)
        groups.upcoming.push(alert)
      }
    }

    const order: UrgencyLevel[] = ["overdue", "today", "this_week", "upcoming"]
    return order
      .filter((level) => groups[level].length > 0)
      .map((level) => ({ level, alerts: groups[level] }))
  }, [alerts])

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 p-12 text-center">
        <Bell className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">
          {emptyMessage || "No hay alertas"}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groupedAlerts.map(({ level, alerts: groupAlerts }) => (
        <div key={level} className="space-y-2">
          {/* Group header */}
          <div className="flex items-center gap-2 px-1">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {urgencyConfig[level].label}
            </h3>
            <Badge variant="secondary" className="text-xs rounded-full h-5 px-2">
              {groupAlerts.length}
            </Badge>
          </div>

          {/* Alert cards */}
          <div className="space-y-2">
            {groupAlerts.map((alert) => {
              const urgency = alert.status === "PENDING" ? getUrgency(alert.date_due) : "upcoming"
              const config = urgencyConfig[urgency]
              const isPending = alert.status === "PENDING"

              return (
                <div
                  key={alert.id}
                  className={`
                    rounded-xl border border-border/40 border-l-4 ${config.border} ${config.bg}
                    p-4 transition-all
                    ${!isPending ? "opacity-60" : ""}
                  `}
                >
                  <div className="flex items-start gap-4">
                    {/* Main content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Top row: type badge + date */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="gap-1.5 text-xs rounded-full">
                          {getTypeIcon(alert.type)}
                          {typeLabels[alert.type] || alert.type}
                        </Badge>

                        {!isPending && (
                          <Badge
                            variant={alert.status === "DONE" ? "default" : "secondary"}
                            className="text-xs rounded-full"
                          >
                            {statusLabels[alert.status]}
                          </Badge>
                        )}

                        <span className="ml-auto flex items-center gap-1.5 text-sm shrink-0">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className={getRelativeDateColor(alert.date_due)}>
                            {getRelativeDate(alert.date_due)}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            ({format(new Date(alert.date_due), "dd/MM/yyyy", { locale: es })})
                          </span>
                        </span>
                      </div>

                      {/* Description */}
                      <p className="font-medium text-sm leading-relaxed">{alert.description}</p>

                      {/* Context row */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {alert.customers && (
                          <span>
                            {alert.customers.first_name} {alert.customers.last_name}
                          </span>
                        )}
                        {alert.operations && (
                          <>
                            <span>{alert.operations.destination}</span>
                            {alert.operations.agencies?.name && (
                              <span>{alert.operations.agencies.name}</span>
                            )}
                          </>
                        )}
                        {alert.leads && (
                          <>
                            <span>{alert.leads.contact_name}</span>
                            <span>{alert.leads.destination}</span>
                          </>
                        )}
                      </div>

                      {/* WhatsApp messages */}
                      {alert.whatsapp_messages && alert.whatsapp_messages.length > 0 && (
                        <div className="mt-1">
                          {alert.whatsapp_messages
                            .filter((msg) => msg.status === "PENDING")
                            .map((msg) => (
                              <div
                                key={msg.id}
                                className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-3 py-2"
                              >
                                <MessageSquare className="h-3 w-3 text-green-600 shrink-0" />
                                <span className="truncate">{msg.message.substring(0, 80)}...</span>
                                <a
                                  href={msg.whatsapp_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-auto text-primary hover:underline flex items-center gap-1 shrink-0"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Enviar
                                </a>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Link to operation/lead */}
                      {alert.operation_id && (
                        <Link href={`/operations/${alert.operation_id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="Ver operacion"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                      {alert.lead_id && !alert.operation_id && (
                        <Link href="/sales/leads">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="Ver lead"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}

                      {isPending && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => onMarkDone?.(alert.id)}
                            title="Resolver"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => onIgnore?.(alert.id)}
                            title="Ignorar"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
