"use client"

import { useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { format, differenceInDays, isToday, isTomorrow } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import { MessageSquare, ExternalLink } from "lucide-react"

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
  UPCOMING_TRIP: "✈️ Viaje",
  MISSING_DOC: "Documento Faltante",
  GENERIC: "Genérico",
  PAYMENT_REMINDER_7D: "Pago (7 días)",
  PAYMENT_REMINDER_3D: "Pago (3 días)",
  PAYMENT_REMINDER_TODAY: "Pago (Hoy)",
  PAYMENT_OVERDUE: "Pago Vencido",
  LEAD_CHECKIN_30D: "Check-in (30 días)",
  LEAD_CHECKIN_15D: "Check-in (15 días)",
  LEAD_CHECKIN_7D: "Check-in (7 días)",
  LEAD_CHECKIN_TODAY: "Check-in (Hoy)",
  RECURRING_PAYMENT: "Pago Recurrente",
  PASSPORT_EXPIRY: "⚠️ Pasaporte",
  DESTINATION_REQUIREMENT: "📋 Requisito",
  BIRTHDAY: "🎂 Cumpleaños",
}

const statusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  DONE: "Resuelto",
  IGNORED: "Ignorado",
}

export function AlertsTable({
  alerts,
  isLoading = false,
  onMarkDone,
  onIgnore,
  emptyMessage,
}: AlertsTableProps) {
  const rowsToRender = useMemo(() => {
    if (isLoading) {
      return Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={`skeleton-${index}`}>
          <TableCell colSpan={6}>
            <Skeleton className="h-6 w-full" />
          </TableCell>
        </TableRow>
      ))
    }

    if (alerts.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={6} className="text-center text-muted-foreground">
            {emptyMessage || "No hay alertas"}
          </TableCell>
        </TableRow>
      )
    }

    return alerts.map((alert) => (
      <TableRow key={alert.id}>
        <TableCell>
          <Badge variant="outline">{typeLabels[alert.type] || alert.type}</Badge>
        </TableCell>
        <TableCell>
          <div className="space-y-1">
            <p className="font-medium">{alert.description}</p>
            {alert.operations && (
              <p className="text-xs text-muted-foreground">
                {alert.operations.destination} - {alert.operations.agencies?.name || "Sin agencia"}
              </p>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span>{format(new Date(alert.date_due), "dd/MM/yyyy", { locale: es })}</span>
              {alert.status === "PENDING" && (
                <>
                  {isToday(new Date(alert.date_due)) && (
                    <Badge variant="destructive" className="text-xs">Hoy</Badge>
                  )}
                  {isTomorrow(new Date(alert.date_due)) && (
                    <Badge variant="outline" className="text-xs">Mañana</Badge>
                  )}
                  {!isToday(new Date(alert.date_due)) && !isTomorrow(new Date(alert.date_due)) && (
                    <Badge variant="outline" className="text-xs">
                      {differenceInDays(new Date(alert.date_due), new Date())} días
                    </Badge>
                  )}
                </>
              )}
            </div>
            {/* Mostrar mensaje asociado si existe */}
            {alert.whatsapp_messages && alert.whatsapp_messages.length > 0 && (
              <div className="mt-2 p-2 bg-muted rounded-md">
                {alert.whatsapp_messages
                  .filter((msg) => msg.status === "PENDING")
                  .map((msg) => (
                    <div key={msg.id} className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <MessageSquare className="h-3 w-3" />
                        <span className="font-medium">Mensaje pendiente:</span>
                        <span className="text-muted-foreground">
                          {format(new Date(msg.scheduled_for), "dd/MM/yyyy", { locale: es })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{msg.message.substring(0, 100)}...</p>
                      <a
                        href={msg.whatsapp_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Enviar a {msg.customer_name} ({msg.phone})
                      </a>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant={
              alert.status === "DONE"
                ? "default"
                : alert.status === "IGNORED"
                ? "secondary"
                : "destructive"
            }
          >
            {statusLabels[alert.status] || alert.status}
          </Badge>
        </TableCell>
        <TableCell>
          {alert.operation_id && (
            <Link href={`/operations/${alert.operation_id}`}>
              <Button variant="link" size="sm">
                Ver operación
              </Button>
            </Link>
          )}
          {alert.lead_id && !alert.operation_id && (
            <Link href={`/sales/leads`}>
              <Button variant="link" size="sm">
                Ver lead
              </Button>
            </Link>
          )}
        </TableCell>
        <TableCell>
          {alert.status === "PENDING" && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onMarkDone?.(alert.id)}>
                Resolver
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onIgnore?.(alert.id)}>
                Ignorar
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>
    ))
  }, [alerts, isLoading, emptyMessage, onMarkDone, onIgnore])

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Fecha Vencimiento</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Operación</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{rowsToRender}</TableBody>
      </Table>
    </div>
  )
}

