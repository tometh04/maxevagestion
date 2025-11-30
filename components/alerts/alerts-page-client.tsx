"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertsTable, Alert } from "./alerts-table"
import { AlertsFilters, AlertsFiltersState } from "./alerts-filters"
import { Button } from "@/components/ui/button"

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Alertas</h1>
        <p className="text-muted-foreground">Gestiona alertas y recordatorios importantes</p>
      </div>

      <AlertsFilters agencies={agencies} value={filters} defaultValue={defaultFilters} onChange={setFilters} />

      <div className="flex justify-end">
        <Button onClick={fetchAlerts} disabled={loading}>
          Actualizar
        </Button>
      </div>

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

