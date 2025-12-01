"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface MonthData {
  month: string
  monthName: string
  sales: number
  margin: number
  operationCount: number
}

interface TrendChartProps {
  className?: string
}

export function TrendChart({ className }: TrendChartProps) {
  const [data, setData] = useState<MonthData[]>([])
  const [loading, setLoading] = useState(true)
  const [trend, setTrend] = useState<{ percentage: number; direction: string }>({ percentage: 0, direction: "up" })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const response = await fetch("/api/analytics/seasonality?months=6")
      const result = await response.json()
      if (result.success) {
        setData(result.monthlyData || [])
        setTrend(result.summary?.trend || { percentage: 0, direction: "up" })
      }
    } catch (error) {
      console.error("Error fetching trend data:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-5 w-[180px]" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    )
  }

  // Calcular el máximo para la escala
  const maxSales = Math.max(...data.map(d => d.sales), 1)

  const TrendIcon = trend.direction === "up" ? TrendingUp : trend.direction === "down" ? TrendingDown : Minus
  const trendColor = trend.direction === "up" ? "text-green-600" : trend.direction === "down" ? "text-red-600" : "text-gray-600"

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Tendencia de Ventas</CardTitle>
          <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
            <TrendIcon className="h-4 w-4" />
            <span className="font-semibold">{Math.abs(trend.percentage).toFixed(1)}%</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Últimos 6 meses</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 h-[180px]">
          {data.map((month, index) => {
            const height = maxSales > 0 ? (month.sales / maxSales) * 100 : 0
            const isCurrentMonth = index === data.length - 1
            
            return (
              <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col items-center justify-end h-[140px]">
                  <span className="text-xs text-muted-foreground mb-1">
                    {month.sales > 0 ? `$${(month.sales / 1000).toFixed(0)}k` : "-"}
                  </span>
                  <div
                    className={`w-full rounded-t transition-all ${
                      isCurrentMonth 
                        ? "bg-primary" 
                        : "bg-primary/30 hover:bg-primary/50"
                    }`}
                    style={{ height: `${Math.max(height, 4)}%` }}
                    title={`${month.monthName}: $${month.sales.toLocaleString("es-AR")}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{month.monthName.slice(0, 3)}</span>
              </div>
            )
          })}
        </div>
        
        {/* Resumen */}
        <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-sm font-semibold">
              ${data.reduce((sum, d) => sum + d.sales, 0).toLocaleString("es-AR")}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Operaciones</p>
            <p className="text-sm font-semibold">
              {data.reduce((sum, d) => sum + d.operationCount, 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Promedio/mes</p>
            <p className="text-sm font-semibold">
              ${Math.round(data.reduce((sum, d) => sum + d.sales, 0) / Math.max(data.length, 1)).toLocaleString("es-AR")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

