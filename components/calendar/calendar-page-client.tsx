"use client"

import { useState, useEffect, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  isBefore,
  startOfDay,
  addMonths,
  subMonths,
} from "date-fns"
import { es } from "date-fns/locale"
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plane,
  DollarSign,
  Bell,
  Users,
  CalendarDays,
  Hotel,
} from "lucide-react"
import Link from "next/link"

interface CalendarEvent {
  id: string
  type: "CHECKIN" | "CHECKOUT" | "DEPARTURE" | "PAYMENT_DUE" | "QUOTATION_EXPIRY" | "FOLLOW_UP" | "REMINDER"
  title: string
  date: string
  description?: string
  color: string
  operationId?: string
  leadId?: string
}

const typeConfig: Record<string, { label: string; icon: typeof Plane; className: string }> = {
  CHECKIN: { label: "Check-in", icon: Hotel, className: "bg-primary/15 text-primary border-primary/20" },
  CHECKOUT: { label: "Check-out", icon: Hotel, className: "bg-accent-violet/15 text-accent-violet border-accent-violet/20" },
  DEPARTURE: { label: "Salida", icon: Plane, className: "bg-success/15 text-success border-success/20" },
  PAYMENT_DUE: { label: "Pago", icon: DollarSign, className: "bg-accent-coral/15 text-accent-coral border-accent-coral/20" },
  QUOTATION_EXPIRY: { label: "Cotización", icon: CalendarDays, className: "bg-accent-coral/15 text-accent-coral border-accent-coral/20" },
  FOLLOW_UP: { label: "Seguimiento", icon: Users, className: "bg-accent-violet/15 text-accent-violet border-accent-violet/20" },
  REMINDER: { label: "Recordatorio", icon: Bell, className: "bg-primary/15 text-primary border-primary/20" },
}

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

export function CalendarPageClient() {
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [typeFilter, setTypeFilter] = useState("ALL")

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

  // Group events by date
  const eventsByDate = useMemo(() => {
    const filtered = typeFilter === "ALL" ? events : events.filter(e => e.type === typeFilter)
    return filtered.reduce((acc, event) => {
      const date = event.date.split("T")[0]
      if (!acc[date]) acc[date] = []
      acc[date].push(event)
      return acc
    }, {} as Record<string, CalendarEvent[]>)
  }, [events, typeFilter])

  // Calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  // Selected day events
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd")
  const dayEvents = eventsByDate[selectedDateStr] || []

  // Count events by type for the selected day
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const event of dayEvents) {
      counts[event.type] = (counts[event.type] || 0) + 1
    }
    return counts
  }, [dayEvents])

  // Month-level stats
  const monthStats = useMemo(() => {
    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM")
    let departures = 0, reminders = 0, payments = 0, followups = 0
    for (const event of events) {
      const eventMonth = event.date.split("T")[0].substring(0, 7)
      if (eventMonth !== monthStart) continue
      if (event.type === "DEPARTURE") departures++
      else if (event.type === "REMINDER") reminders++
      else if (event.type === "PAYMENT_DUE") payments++
      else if (event.type === "FOLLOW_UP") followups++
    }
    return { departures, reminders, payments, followups }
  }, [events, currentMonth])

  const getEventLink = (event: CalendarEvent): string | null => {
    if (event.operationId) return `/operations/${event.operationId}`
    if (event.leadId) return `/sales/leads`
    return null
  }

  // Get unique event types for a day (for dot indicators)
  function getDayEventTypes(date: Date): string[] {
    const dateStr = format(date, "yyyy-MM-dd")
    const dayEvts = eventsByDate[dateStr] || []
    return Array.from(new Set(dayEvts.map(e => e.type)))
  }

  function getDayEventCount(date: Date): number {
    const dateStr = format(date, "yyyy-MM-dd")
    return (eventsByDate[dateStr] || []).length
  }

  if (loading) {
    return <Skeleton className="h-[700px] w-full rounded-xl" />
  }

  return (
    <div className="space-y-6">
      {/* Month KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Plane className="h-3.5 w-3.5 text-success" />
            Salidas
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{monthStats.departures}</div>
        </div>
        <div className="rounded-xl border border-border/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Bell className="h-3.5 w-3.5 text-primary" />
            Recordatorios
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{monthStats.reminders}</div>
        </div>
        <div className="rounded-xl border border-border/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5 text-accent-coral" />
            Pagos
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{monthStats.payments}</div>
        </div>
        <div className="rounded-xl border border-border/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5 text-accent-violet" />
            Seguimientos
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{monthStats.followups}</div>
        </div>
      </div>

      {/* Calendar Header: Navigation + Filters */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold capitalize min-w-[180px] text-center">
            {format(currentMonth, "MMMM yyyy", { locale: es })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs ml-1"
            onClick={() => {
              setCurrentMonth(new Date())
              setSelectedDate(new Date())
            }}
          >
            Hoy
          </Button>
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background w-[160px]">
            <SelectValue placeholder="Filtrar tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los tipos</SelectItem>
            {Object.entries(typeConfig).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>
                {cfg.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Full Month Calendar Grid */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        {/* Day name headers */}
        <div className="grid grid-cols-7 border-b border-border/40 bg-muted/30">
          {DAY_NAMES.map(day => (
            <div key={day} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days grid */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const eventTypes = getDayEventTypes(day)
            const eventCount = getDayEventCount(day)
            const isSelected = isSameDay(day, selectedDate)
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const today = isToday(day)
            const isPast = isBefore(day, startOfDay(new Date())) && !today

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(day)}
                className={`
                  relative min-h-[80px] p-1.5 border-b border-r border-border/20 text-left transition-colors
                  hover:bg-accent/50
                  ${!isCurrentMonth ? "bg-muted/20 opacity-40" : ""}
                  ${isPast && isCurrentMonth ? "opacity-50" : ""}
                  ${isSelected ? "bg-accent ring-2 ring-primary/40 ring-inset" : ""}
                `}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`
                      text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                      ${today ? "bg-primary text-primary-foreground" : ""}
                      ${isSelected && !today ? "font-bold" : ""}
                    `}
                  >
                    {format(day, "d")}
                  </span>
                  {eventCount > 0 && (
                    <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
                      {eventCount}
                    </span>
                  )}
                </div>
                {/* Event type dots */}
                {eventTypes.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {eventTypes.slice(0, 3).map(type => {
                      const cfg = typeConfig[type]
                      const count = (eventsByDate[format(day, "yyyy-MM-dd")] || []).filter(e => e.type === type).length
                      return (
                        <div
                          key={type}
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${cfg?.className || "bg-muted"}`}
                        >
                          {count > 1 ? `${count}× ` : ""}{cfg?.label || type}
                        </div>
                      )
                    })}
                    {eventTypes.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        +{eventTypes.length - 3} más
                      </div>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected Day Detail Panel */}
      <div className="rounded-xl border border-border/40">
        <div className="px-5 py-4 border-b border-border/40 bg-muted/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold capitalize">
                {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {dayEvents.length === 0
                  ? "Sin eventos programados"
                  : `${dayEvents.length} evento${dayEvents.length !== 1 ? "s" : ""}`
                }
              </p>
            </div>
            {Object.keys(typeCounts).length > 0 && (
              <div className="flex gap-1.5">
                {Object.entries(typeCounts).map(([type, count]) => {
                  const cfg = typeConfig[type]
                  return (
                    <Badge key={type} variant="outline" className={`text-[10px] gap-1 ${cfg?.className || ""}`}>
                      {cfg?.label} ({count})
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {dayEvents.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No hay eventos para este día</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {dayEvents.map((event) => {
              const cfg = typeConfig[event.type]
              const IconComponent = cfg?.icon || CalendarDays
              const link = getEventLink(event)

              const isEventPast = isBefore(new Date(event.date), startOfDay(new Date()))

              return (
                <div
                  key={event.id}
                  className={`flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors ${isEventPast ? "opacity-50" : ""}`}
                >
                  <div className={`p-2 rounded-lg shrink-0 ${cfg?.className || "bg-muted"}`}>
                    <IconComponent className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{event.title}</p>
                    {event.description && (
                      <p className="text-xs text-muted-foreground truncate">{event.description}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${cfg?.className || ""}`}>
                    {cfg?.label || event.type}
                  </Badge>
                  {link && (
                    <Link href={link}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
