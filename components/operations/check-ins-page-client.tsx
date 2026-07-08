"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Plane, PlaneLanding, MapPin, Users, CalendarIcon, ChevronRight, X } from "lucide-react"
import { format, differenceInDays, isSameDay } from "date-fns"
import { es } from "date-fns/locale"
import { buildCheckinEvents, type CheckinEvent, type CheckinOperation } from "@/lib/operations/checkin-events"

type TypeFilter = "ALL" | "departure" | "return"

export function CheckInsPageClient() {
  const [events, setEvents] = useState<CheckinEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL")
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined)

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true)
      const todayDate = new Date()
      todayDate.setHours(0, 0, 0, 0)

      // Ventana amplia: viajes ya iniciados con regreso pendiente (−90) y
      // salidas futuras (+180). El endpoint scopea por org/rol.
      const from = new Date(todayDate)
      from.setDate(todayDate.getDate() - 90)
      const to = new Date(todayDate)
      to.setDate(todayDate.getDate() + 180)

      const params = new URLSearchParams()
      params.set("dateFrom", from.toISOString().split("T")[0])
      params.set("dateTo", to.toISOString().split("T")[0])
      params.set("status", "CONFIRMED")
      params.set("limit", "300")

      const res = await fetch(`/api/operations/upcoming-trips?${params.toString()}`)
      const data: { operations?: CheckinOperation[] } = res.ok ? await res.json() : { operations: [] }
      setEvents(buildCheckinEvents(data.operations ?? [], todayDate))
    } catch (error) {
      console.error("Error fetching check-ins:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Filtrar por tipo y (opcionalmente) por día seleccionado, luego agrupar por día.
  const groups = useMemo(() => {
    const filtered = events.filter((ev) => {
      if (typeFilter === "departure" && ev.isReturn) return false
      if (typeFilter === "return" && !ev.isReturn) return false
      if (selectedDay && !isSameDay(ev.date, selectedDay)) return false
      return true
    })

    const byDay = new Map<string, CheckinEvent[]>()
    for (const ev of filtered) {
      const key = format(ev.date, "yyyy-MM-dd")
      const arr = byDay.get(key)
      if (arr) arr.push(ev)
      else byDay.set(key, [ev])
    }
    return Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [events, typeFilter, selectedDay])

  const totalDepartures = events.filter((e) => !e.isReturn).length
  const totalReturns = events.filter((e) => e.isReturn).length

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border p-0.5">
          {([
            { key: "ALL", label: "Todos" },
            { key: "departure", label: "Salidas" },
            { key: "return", label: "Regresos" },
          ] as const).map((opt) => (
            <Button
              key={opt.key}
              variant={typeFilter === opt.key ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTypeFilter(opt.key)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {selectedDay ? format(selectedDay, "d 'de' MMMM", { locale: es }) : "Ir a un día"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDay}
              onSelect={setSelectedDay}
              locale={es}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {selectedDay && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => setSelectedDay(undefined)}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Ver todos los próximos
          </Button>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Plane className="h-3.5 w-3.5" /> {totalDepartures} salidas
          </span>
          <span className="flex items-center gap-1">
            <PlaneLanding className="h-3.5 w-3.5" /> {totalReturns} regresos
          </span>
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Plane className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Sin salidas ni regresos para mostrar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map(([dayKey, dayEvents]) => {
            const dayDate = dayEvents[0].date
            const deps = dayEvents.filter((e) => !e.isReturn).length
            const rets = dayEvents.filter((e) => e.isReturn).length
            return (
              <div key={dayKey}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background/95 backdrop-blur py-1 z-10">
                  <h2 className="text-sm font-semibold capitalize">
                    {format(dayDate, "EEEE d 'de' MMMM", { locale: es })}
                  </h2>
                  {deps > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      {deps} {deps === 1 ? "salida" : "salidas"}
                    </Badge>
                  )}
                  {rets > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-sky-600 border-sky-500/30">
                      {rets} {rets === 1 ? "regreso" : "regresos"}
                    </Badge>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {dayEvents.map((ev) => {
                    const daysUntil = differenceInDays(ev.date, new Date())
                    const Icon = ev.isReturn ? PlaneLanding : Plane
                    return (
                      <Link
                        key={`${ev.operationId}-${ev.isReturn ? "return" : "departure"}`}
                        href={`/operations/${ev.operationId}`}
                        prefetch={false}
                      >
                        <div className="p-3 rounded-md border hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="flex items-center gap-2">
                            <div
                              className={`p-1.5 rounded-full text-white shrink-0 ${
                                ev.isReturn ? "bg-sky-500" : "bg-success"
                              }`}
                            >
                              <Icon className="h-3 w-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="font-mono text-[10px] text-muted-foreground">{ev.fileCode}</span>
                                <Badge
                                  variant={ev.isReturn ? "outline" : "secondary"}
                                  className={`text-[10px] px-1.5 py-0 h-4 ${
                                    ev.isReturn ? "text-sky-600 border-sky-500/30" : ""
                                  }`}
                                >
                                  {ev.isReturn ? "Regreso" : "Salida"}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">
                                  {daysUntil === 0 ? "HOY" : daysUntil === 1 ? "mañana" : `en ${daysUntil} días`}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 font-medium text-sm leading-tight">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{ev.destination}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-0.5">
                                  <Users className="h-3 w-3" />
                                  {ev.totalPax}
                                </span>
                                {ev.sellerName && <span className="truncate">• {ev.sellerName}</span>}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
