"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { ExternalLink } from "lucide-react"
import Link from "next/link"

interface CalendarEvent {
  id: string
  type: "CHECKIN" | "DEPARTURE" | "PAYMENT_DUE" | "QUOTATION_EXPIRY" | "FOLLOW_UP" | "REMINDER"
  title: string
  date: string
  description?: string
  color: string
  operationId?: string
  leadId?: string
}

const typeLabels: Record<string, string> = {
  CHECKIN: "Check-in",
  DEPARTURE: "Salida",
  PAYMENT_DUE: "Pago",
  QUOTATION_EXPIRY: "Cotización",
  FOLLOW_UP: "Seguimiento",
  REMINDER: "Recordatorio",
}

export function CalendarPageClient() {
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    setLoading(true)
    try {
      const response = await fetch("/api/calendar/events")
      if (!response.ok) throw new Error("Error al obtener eventos")

      const data = await response.json()
      setEvents(data.events || [])
    } catch (error) {
      console.error("Error fetching events:", error)
    } finally {
      setLoading(false)
    }
  }

  const eventsByDate = events.reduce((acc, event) => {
    const date = event.date.split("T")[0]
    if (!acc[date]) acc[date] = []
    acc[date].push(event)
    return acc
  }, {} as Record<string, CalendarEvent[]>)

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd")
  const dayEvents = eventsByDate[selectedDateStr] || []

  // Función para obtener el enlace según el tipo de evento
  const getEventLink = (event: CalendarEvent): string | null => {
    if (event.operationId) {
      return `/operations/${event.operationId}`
    }
    if (event.leadId) {
      return `/sales/leads`
    }
    return null
  }

  if (loading) {
    return <Skeleton className="h-[600px] w-full" />
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Calendario</CardTitle>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            className="rounded-md border"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Eventos del {format(selectedDate, "PPP", { locale: es })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dayEvents.length === 0 ? (
            <p className="text-muted-foreground">No hay eventos para esta fecha</p>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((event) => {
                const link = getEventLink(event)
                
                return (
                  <div key={event.id} className="flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                    <Badge style={{ backgroundColor: event.color }} className="shrink-0">
                      {typeLabels[event.type] || event.type}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{event.title}</p>
                      {event.description && (
                        <p className="text-sm text-muted-foreground truncate">{event.description}</p>
                      )}
                    </div>
                    {link && (
                      <Link href={link}>
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Ver
                        </Button>
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
