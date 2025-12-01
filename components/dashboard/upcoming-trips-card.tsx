"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plane, ChevronRight, MapPin, Users, Calendar } from "lucide-react"
import { format, differenceInDays } from "date-fns"
import { es } from "date-fns/locale"
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

export function UpcomingTripsCard() {
  const [operations, setOperations] = useState<Operation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUpcomingTrips()
  }, [])

  const fetchUpcomingTrips = async () => {
    try {
      setLoading(true)
      const today = new Date().toISOString().split("T")[0]
      const nextMonth = new Date()
      nextMonth.setDate(nextMonth.getDate() + 30)
      const nextMonthStr = nextMonth.toISOString().split("T")[0]
      
      const response = await fetch(`/api/operations?dateFrom=${today}&dateTo=${nextMonthStr}&status=CONFIRMED&limit=5`)
      const data = await response.json()
      setOperations(data.operations || [])
    } catch (error) {
      console.error("Error fetching upcoming trips:", error)
    } finally {
      setLoading(false)
    }
  }

  const getDaysUntilTrip = (dateStr: string) => {
    return differenceInDays(new Date(dateStr), new Date())
  }

  const getUrgencyColor = (days: number) => {
    if (days <= 3) return "bg-red-500"
    if (days <= 7) return "bg-orange-500"
    if (days <= 14) return "bg-yellow-500"
    return "bg-green-500"
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Plane className="h-4 w-4" />
            Próximos Viajes
          </CardTitle>
          <CardDescription>Salidas confirmadas</CardDescription>
        </div>
        <Link href="/operations?status=CONFIRMED">
          <Button variant="ghost" size="sm">
            Ver todos
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
        ) : operations.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Plane className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay viajes próximos</p>
          </div>
        ) : (
          <ScrollArea className="h-[280px] pr-3">
            <div className="space-y-3">
              {operations.map((op) => {
                const daysUntil = getDaysUntilTrip(op.departure_date)
                const totalPax = op.adults + op.children + op.infants

                return (
                  <Link key={op.id} href={`/operations/${op.id}`}>
                    <div className="p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-full ${getUrgencyColor(daysUntil)} text-white`}>
                          <Plane className="h-3 w-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-muted-foreground">
                              {op.file_code}
                            </span>
                            <Badge variant={daysUntil <= 3 ? "destructive" : "secondary"} className="text-xs">
                              {daysUntil === 0 
                                ? "HOY" 
                                : daysUntil === 1 
                                  ? "MAÑANA" 
                                  : `${daysUntil} días`}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <MapPin className="h-3 w-3" />
                            {op.destination}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(op.departure_date), "d MMM", { locale: es })}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {totalPax} pax
                            </span>
                            {op.sellers?.name && (
                              <span>• {op.sellers.name}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
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

