"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertsTable, Alert } from "./alerts-table"
import { AlertsFilters, AlertsFiltersState } from "./alerts-filters"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import Link from "next/link"
import { RefreshCw, AlertTriangle, Clock, CalendarDays, CalendarClock } from "lucide-react"
import { isToday, isBefore, startOfDay, endOfWeek, startOfWeek, isAfter } from "date-fns"

interface AlertsPageClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultFilters: AlertsFiltersState
}

export function AlertsPageClient({ agencies, defaultFilters }: AlertsPageClientProps) {
  const [filters, setFilters] = useState(defaultFilters)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.type !== "ALL") {
        params.set("type", filters.type)
      }
      if (filters.status !== "ALL") {
        params.set("status", filters.status)
      }
      if (filters.dateFrom) {
        params.set("dateFrom", filters.dateFrom)
      }
      if (filters.dateTo) {
        params.set("dateTo", filters.dateTo)
      }
      if (filters.agencyId !== "ALL") {
        params.set("agencyId", filters.agencyId)
      }

      const response = await fetch(`/api/alerts?${params.toString()}`)
      const data = await response.json()
      setAlerts(data.alerts || [])
    } catch (error) {
      console.error("Error fetching alerts:", error)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  const handleMarkDone = useCallback(
    async (alertId: string) => {
      try {
        await fetch("/api/alerts/mark-done", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId }),
        })
        fetchAlerts()
      } catch (error) {
        console.error("Error marking alert as done:", error)
      }
    },
    [fetchAlerts],
  )

  const handleIgnore = useCallback(
    async (alertId: string) => {
      try {
        await fetch("/api/alerts/ignore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId }),
        })
        fetchAlerts()
      } catch (error) {
        console.error("Error ignoring alert:", error)
      }
    },
    [fetchAlerts],
  )

  // Compute KPI counts from pending alerts
  const kpis = useMemo(() => {
    const now = new Date()
    const todayStart = startOfDay(now)
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

    let overdue = 0
    let today = 0
    let thisWeek = 0
    let upcoming = 0

    for (const alert of alerts) {
      if (alert.status !== "PENDING") continue
      const due = new Date(alert.date_due)
      const dueDay = startOfDay(due)

      if (isBefore(dueDay, todayStart)) {
        overdue++
      } else if (isToday(due)) {
        today++
      } else if (!isAfter(dueDay, weekEnd)) {
        thisWeek++
      } else {
        upcoming++
      }
    }

    return { overdue, today, thisWeek, upcoming }
  }, [alerts])

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Alertas</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
          <p className="text-muted-foreground">Gestiona alertas y recordatorios importantes</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAlerts}
          disabled={loading}
          className="rounded-full gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            Vencidas
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{kpis.overdue}</div>
        </div>
        <div className="rounded-xl border border-border/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            Hoy
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{kpis.today}</div>
        </div>
        <div className="rounded-xl border border-border/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5 text-blue-500" />
            Esta semana
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{kpis.thisWeek}</div>
        </div>
        <div className="rounded-xl border border-border/40 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
            Proximas
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{kpis.upcoming}</div>
        </div>
      </div>

      <AlertsFilters agencies={agencies} value={filters} defaultValue={defaultFilters} onChange={setFilters} />

      <AlertsTable
        alerts={alerts}
        isLoading={loading}
        onMarkDone={handleMarkDone}
        onIgnore={handleIgnore}
        emptyMessage="No hay alertas con los filtros seleccionados"
      />
    </div>
  )
}
