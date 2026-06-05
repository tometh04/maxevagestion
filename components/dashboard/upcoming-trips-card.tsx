"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plane, ChevronRight, MapPin, Users, Calendar, RotateCcw } from "lucide-react"
import { format, differenceInDays } from "date-fns"
import { es } from "date-fns/locale"
import { parseDateOnlyLocal } from "@/lib/utils/date-only"
import Link from "next/link"

interface Operation {
  id: string
  file_code: string
  destination: string
  departure_date: string
  return_date: string | null
  adults: number
  children: number
  infants: number
  status: string
  sellers?: { name: string } | null
}

interface CheckinEvent {
  operationId: string
  fileCode: string
  destination: string
  date: Date
  dateStr: string
  isReturn: boolean
  totalPax: number
  sellerName?: string | null
}

interface UpcomingTripsCardProps {
  agencyId?: string
  sellerId?: string
}

export function UpcomingTripsCard({ agencyId, sellerId }: UpcomingTripsCardProps = {}) {
  const [events, setEvents] = useState<CheckinEvent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchUpcomingTrips = useCallback(async () => {
    try {
      setLoading(true)
      const todayDate = new Date()
      todayDate.setHours(0, 0, 0, 0)

      // Extendemos el dateFrom 60 días atrás para capturar viajes ya iniciados
      // con vuelo de regreso aún pendiente (departure_date pasado, return_date futuro).
      const sixtyDaysAgo = new Date(todayDate)
      sixtyDaysAgo.setDate(todayDate.getDate() - 60)
      const ninetyDaysAhead = new Date(todayDate)
      ninetyDaysAhead.setDate(todayDate.getDate() + 90)

      const params = new URLSearchParams()
      params.set("dateFrom", sixtyDaysAgo.toISOString().split("T")[0])
      params.set("dateTo", ninetyDaysAhead.toISOString().split("T")[0])
      params.set("status", "CONFIRMED")
      params.set("limit", "100")
      if (agencyId && agencyId !== "ALL") params.set("agencyId", agencyId)
      if (sellerId && sellerId !== "ALL") params.set("sellerId", sellerId)

      let data: { operations?: Operation[] } = { operations: [] }
      try {
        const response = await fetch(`/api/operations/upcoming-trips?${params.toString()}`)
        if (response.ok) {
          data = await response.json()
        } else {
          throw new Error(`Status ${response.status}`)
        }
      } catch {
        const fallback = await fetch(`/api/operations?${params.toString()}`)
        if (fallback.ok) data = await fallback.json()
      }

      // Construir lista de eventos de check-in (salida + regreso) con fecha futura
      const checkinEvents: CheckinEvent[] = []

      for (const op of data.operations ?? []) {
        const totalPax = op.adults + op.children + op.infants
        const sellerName = op.sellers?.name ?? null

        const departureDate = parseDateOnlyLocal(op.departure_date) ?? new Date(op.departure_date)
        if (departureDate >= todayDate) {
          checkinEvents.push({
            operationId: op.id,
            fileCode: op.file_code,
            destination: op.destination,
            date: departureDate,
            dateStr: op.departure_date,
            isReturn: false,
            totalPax,
            sellerName,
          })
        }

        if (op.return_date) {
          const returnDate = parseDateOnlyLocal(op.return_date) ?? new Date(op.return_date)
          if (returnDate >= todayDate) {
            checkinEvents.push({
              operationId: op.id,
              fileCode: op.file_code,
              destination: op.destination,
              date: returnDate,
              dateStr: op.return_date,
              isReturn: true,
              totalPax,
              sellerName,
            })
          }
        }
      }

      // Ordenar por fecha más próxima y tomar los primeros 10
      checkinEvents.sort((a, b) => a.date.getTime() - b.date.getTime())
      setEvents(checkinEvents.slice(0, 10))
    } catch (error) {
      console.error("Error fetching upcoming check-ins:", error)
    } finally {
      setLoading(false)
    }
  }, [agencyId, sellerId])

  useEffect(() => {
    fetchUpcomingTrips()
  }, [fetchUpcomingTrips])

  const getDaysUntil = (date: Date) => differenceInDays(date, new Date())

  const getUrgencyColor = (days: number) => {
    if (days <= 3) return "bg-destructive"
    if (days <= 7) return "bg-accent-coral"
    if (days <= 14) return "bg-accent-coral/30"
    return "bg-success"
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <div>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Plane className="h-4 w-4" />
            Próximos Check-ins
          </CardTitle>
          <CardDescription className="text-xs">Salidas y regresos confirmados</CardDescription>
        </div>
        <Link href="/operations?status=CONFIRMED">
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            Ver todos
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
        ) : events.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <Plane className="h-6 w-6 mx-auto mb-1 opacity-50" />
            <p className="text-xs">Sin check-ins próximos</p>
          </div>
        ) : (
          <ScrollArea className="h-[220px]">
            <div className="space-y-2 pr-2">
              {events.map((ev) => {
                const daysUntil = getDaysUntil(ev.date)
                const Icon = ev.isReturn ? RotateCcw : Plane

                return (
                  <Link key={`${ev.operationId}-${ev.isReturn ? "return" : "departure"}`} href={`/operations/${ev.operationId}`} prefetch={false}>
                    <div className="p-2 rounded-md border hover:bg-muted/50 transition-colors cursor-pointer text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-full ${getUrgencyColor(daysUntil)} text-white shrink-0`}>
                          <Icon className="h-2.5 w-2.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {ev.fileCode}
                            </span>
                            <Badge
                              variant={daysUntil <= 3 ? "destructive" : "secondary"}
                              className="text-[10px] px-1.5 py-0 h-4"
                            >
                              {daysUntil === 0 ? "HOY" : daysUntil === 1 ? "MAÑANA" : `${daysUntil} días`}
                            </Badge>
                            {ev.isReturn && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                                regreso
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 font-medium leading-tight">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{ev.destination}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5">
                              <Calendar className="h-2.5 w-2.5" />
                              {format(ev.date, "d MMM", { locale: es })}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Users className="h-2.5 w-2.5" />
                              {ev.totalPax}
                            </span>
                            {ev.sellerName && (
                              <span className="truncate">• {ev.sellerName}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
