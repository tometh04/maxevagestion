"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Activity,
  RefreshCw,
  Loader2,
  CircleDot,
} from "lucide-react"
import { toast } from "sonner"

interface Indicator {
  id: string
  name: string
  value: string
  status: "green" | "yellow" | "red"
  description: string
}

const statusDot: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
}

const statusBorder: Record<string, string> = {
  green: "border-l-green-500",
  yellow: "border-l-yellow-500",
  red: "border-l-red-500",
}

export function HealthSettings() {
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [overallStatus, setOverallStatus] = useState<string>("green")
  const [loading, setLoading] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/audit-logs/health")
      if (!response.ok) throw new Error("Error al obtener estado de salud")

      const data = await response.json()
      setIndicators(data.indicators || [])
      setOverallStatus(data.overallStatus || "green")
      setCheckedAt(data.checkedAt)
    } catch (error) {
      console.error("Error fetching health:", error)
      toast.error("Error al verificar la salud del sistema")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  const overallLabel =
    overallStatus === "green"
      ? "Todo funciona correctamente"
      : overallStatus === "yellow"
      ? "Hay puntos que requieren atención"
      : "Se detectaron problemas que necesitan acción"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Salud del Sistema</h2>
          <p className="text-sm text-muted-foreground">
            Estado general del sistema financiero y operativo.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Status general */}
      <Card className={`border-l-4 ${statusBorder[overallStatus] || "border-l-gray-500"}`}>
        <CardContent className="flex items-center gap-3 py-4 px-4">
          <div className={`h-3 w-3 rounded-full ${statusDot[overallStatus] || "bg-gray-500"} animate-pulse`} />
          <div>
            <p className="font-medium text-sm">{overallLabel}</p>
            {checkedAt && (
              <p className="text-xs text-muted-foreground">
                Última verificación: {new Date(checkedAt).toLocaleString("es-AR")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Indicadores */}
      {loading && indicators.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {indicators.map((indicator) => (
            <Card
              key={indicator.id}
              className={`border-l-4 ${statusBorder[indicator.status] || "border-l-gray-500"}`}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between mb-1">
                  <span className="text-sm font-medium">{indicator.name}</span>
                  <div className={`h-2 w-2 rounded-full mt-1.5 ${statusDot[indicator.status]}`} />
                </div>
                <p className="text-lg font-bold">{indicator.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{indicator.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
