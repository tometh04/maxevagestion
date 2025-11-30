"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface CalendarEvent {
  id: string
  type: "CHECKIN" | "DEPARTURE" | "PAYMENT_DUE" | "QUOTATION_EXPIRY" | "FOLLOW_UP" | "REMINDER"
  title: string
  date: string
  description?: string
  color: string
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
              {dayEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-2 p-2 rounded border">
                  <Badge style={{ backgroundColor: event.color }}>{event.type}</Badge>
                  <div className="flex-1">
                    <p className="font-medium">{event.title}</p>
                    {event.description && (
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

