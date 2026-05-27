"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PlaneLanding, ChevronRight, MapPin, Users, Calendar } from "lucide-react"
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

interface UpcomingReturnsCardProps {
  agencyId?: string
  sellerId?: string
}

export function UpcomingReturnsCard({ agencyId, sellerId }: UpcomingReturnsCardProps = {}) {
  const [operations, setOperations] = useState<Operation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchUpcomingReturns = useCallback(async () => {
    try {
      setLoading(true)
      const today = new Date().toISOString().split("T")[0]
      const nextThreeMonths = new Date()
      nextThreeMonths.setDate(nextThreeMonths.getDate() + 90)
      const nextThreeMonthsStr = nextThreeMonths.toISOString().split("T")[0]

      const params = new URLSearchParams()
      params.set("status", "CONFIRMED")
      params.set("limit", "50")
      params.set("returnDateFrom", today)
      params.set("returnDateTo", nextThreeMonthsStr)
      if (agencyId && agencyId !== "ALL") {
        params.set("agencyId", agencyId)
      }
      if (sellerId && sellerId !== "ALL") {
        params.set("sellerId", sellerId)
      }

      const response = await fetch(`/api/operations?${params.toString()}`)
      const data = await response.json()

      // Filter operations that have return_date >= today and sort by return_date ascending
      const todayDate = new Date()
      todayDate.setHours(0, 0, 0, 0)
      const withReturn = (data.operations || [])
        .filter((op: Operation) => op.return_date && (parseDateOnlyLocal(op.return_date) ?? new Date(op.return_date)) >= todayDate)
        .sort((a: Operation, b: Operation) =>
          (parseDateOnlyLocal(a.return_date!) ?? new Date(a.return_date!)).getTime() - (parseDateOnlyLocal(b.return_date!) ?? new Date(b.return_date!)).getTime()
        )
        .slice(0, 10)

      setOperations(withReturn)
    } catch (error) {
      console.error("Error fetching upcoming returns:", error)
    } finally {
      setLoading(false)
    }
  }, [agencyId, sellerId])

  useEffect(() => {
    fetchUpcomingReturns()
  }, [fetchUpcomingReturns])

  const getDaysUntilReturn = (dateStr: string) => {
    return differenceInDays(new Date(dateStr), new Date())
  }

  const getUrgencyColor = (days: number) => {
    if (days <= 1) return "bg-destructive"
    if (days <= 3) return "bg-accent-coral"
    if (days <= 7) return "bg-accent-coral/30"
    return "bg-primary"
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <div>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <PlaneLanding className="h-4 w-4" />
            Próximos Regresos
          </CardTitle>
          <CardDescription className="text-xs">Regresos confirmados</CardDescription>
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
        ) : operations.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <PlaneLanding className="h-6 w-6 mx-auto mb-1 opacity-50" />
            <p className="text-xs">Sin regresos próximos</p>
          </div>
        ) : (
          <ScrollArea className="h-[220px]">
            <div className="space-y-2 pr-2">
              {operations.map((op) => {
                const daysUntil = getDaysUntilReturn(op.return_date!)
                const totalPax = op.adults + op.children + op.infants

                return (
                  <Link key={op.id} href={`/operations/${op.id}`} prefetch={false}>
                    <div className="p-2 rounded-md border hover:bg-muted/50 transition-colors cursor-pointer text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-full ${getUrgencyColor(daysUntil)} text-white shrink-0`}>
                          <PlaneLanding className="h-2.5 w-2.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {op.file_code}
                            </span>
                            <Badge
                              variant={daysUntil <= 1 ? "destructive" : "secondary"}
                              className="text-[10px] px-1.5 py-0 h-4"
                            >
                              {daysUntil === 0
                                ? "HOY"
                                : daysUntil === 1
                                  ? "MAÑANA"
                                  : `${daysUntil} días`}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 font-medium leading-tight">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{op.destination}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5">
                              <Calendar className="h-2.5 w-2.5" />
                              {format(parseDateOnlyLocal(op.return_date!) ?? new Date(op.return_date!), "d MMM", { locale: es })}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Users className="h-2.5 w-2.5" />
                              {totalPax}
                            </span>
                            {op.sellers?.name && (
                              <span className="truncate">• {op.sellers.name}</span>
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
