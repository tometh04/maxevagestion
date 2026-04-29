"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Target, CheckCircle2, TrendingUp } from "lucide-react"

interface ObjectiveProgressItem {
  objective_id: string
  current_value: number
  target_value: number
  percentage: number
  is_achieved: boolean
  period_start: string
  period_end: string
  objective: {
    id: string
    name: string
    description: string | null
    metric_type: string
    target_currency: string | null
    reward_type: string
    reward_value: number
    reward_currency: string | null
    period_type: string
    seller_id: string | null
    agency_id: string | null
  }
}

interface SellerObjectivesCardsProps {
  sellerId?: string // si no se pasa, el endpoint usa user.id (el seller logueado)
}

const METRIC_LABELS: Record<string, string> = {
  TRIPS_SOLD: "Viajes vendidos",
  REVENUE_AMOUNT: "Facturación",
  MARGIN_AMOUNT: "Margen",
  NEW_CUSTOMERS: "Clientes nuevos",
  CONVERSION_RATE: "Tasa de conversión",
}

const PERIOD_LABELS: Record<string, string> = {
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  ANNUAL: "Anual",
}

const REWARD_LABELS: Record<string, string> = {
  BONUS_PERCENTAGE: "% bonus sobre comisión",
  BONUS_FIXED: "Bonus fijo",
  PERCENTAGE_INCREASE: "% extra sobre comisión base",
}

function formatMetricValue(metric: string, value: number, currency: string | null): string {
  switch (metric) {
    case "TRIPS_SOLD":
    case "NEW_CUSTOMERS":
      return value.toLocaleString("es-AR", { maximumFractionDigits: 0 })
    case "REVENUE_AMOUNT":
    case "MARGIN_AMOUNT":
      return `${currency || "ARS"} ${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case "CONVERSION_RATE":
      return `${value.toFixed(1)}%`
    default:
      return String(value)
  }
}

function formatReward(rewardType: string, rewardValue: number, rewardCurrency: string | null): string {
  switch (rewardType) {
    case "BONUS_PERCENTAGE":
    case "PERCENTAGE_INCREASE":
      return `+${rewardValue}%`
    case "BONUS_FIXED":
      return `${rewardCurrency || "ARS"} ${rewardValue.toLocaleString("es-AR", { minimumFractionDigits: 0 })}`
    default:
      return String(rewardValue)
  }
}

function formatPeriod(start: string, end: string, periodType: string): string {
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ]
  const [sy, sm] = start.split("-")
  const year = parseInt(sy, 10)
  const monthIdx = parseInt(sm, 10) - 1

  if (periodType === "MONTHLY") return `${months[monthIdx]} ${year}`
  if (periodType === "ANNUAL") return `Año ${year}`
  if (periodType === "QUARTERLY") {
    const quarter = Math.floor(monthIdx / 3) + 1
    return `Q${quarter} ${year}`
  }
  return `${start} al ${end}`
}

export function SellerObjectivesCards({ sellerId }: SellerObjectivesCardsProps) {
  const [progress, setProgress] = useState<ObjectiveProgressItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProgress() {
      setLoading(true)
      try {
        const qs = sellerId ? `?seller_id=${encodeURIComponent(sellerId)}` : ""
        const res = await fetch(`/api/commissions/objectives/progress${qs}`)
        if (!res.ok) {
          setProgress([])
          return
        }
        const data = await res.json()
        setProgress(data.progress || [])
      } catch (err) {
        console.error("Error fetching objectives progress:", err)
        setProgress([])
      } finally {
        setLoading(false)
      }
    }
    fetchProgress()
  }, [sellerId])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Mis objetivos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Cargando objetivos...</p>
        </CardContent>
      </Card>
    )
  }

  if (progress.length === 0) {
    // Si no hay objetivos activos, ocultamos la sección entera (no mostrar
    // una card vacía solo para decir que no hay nada).
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4" />
          Mis objetivos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {progress.map((item) => {
          const pctClamped = Math.min(100, Math.max(0, item.percentage))
          return (
            <div key={item.objective_id} className="space-y-2 rounded-lg border border-border/40 p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold">{item.objective.name}</h4>
                    {item.is_achieved && (
                      <Badge variant="default" className="bg-green-600 text-white">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Alcanzado
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {PERIOD_LABELS[item.objective.period_type] || item.objective.period_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatPeriod(item.period_start, item.period_end, item.objective.period_type)}
                    </span>
                  </div>
                  {item.objective.description && (
                    <p className="text-xs text-muted-foreground mt-1">{item.objective.description}</p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Recompensa</div>
                  <div className="text-sm font-medium flex items-center gap-1 justify-end">
                    <TrendingUp className="h-3 w-3" />
                    {formatReward(
                      item.objective.reward_type,
                      item.objective.reward_value,
                      item.objective.reward_currency
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {REWARD_LABELS[item.objective.reward_type] || item.objective.reward_type}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {METRIC_LABELS[item.objective.metric_type] || item.objective.metric_type}
                  </span>
                  <span className="tabular-nums">
                    {formatMetricValue(
                      item.objective.metric_type,
                      item.current_value,
                      item.objective.target_currency
                    )}
                    {" / "}
                    {formatMetricValue(
                      item.objective.metric_type,
                      item.target_value,
                      item.objective.target_currency
                    )}
                    <span className="ml-2 font-medium">
                      {item.percentage.toFixed(0)}%
                    </span>
                  </span>
                </div>
                <Progress value={pctClamped} className="h-2" />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
