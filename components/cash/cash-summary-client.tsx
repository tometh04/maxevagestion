"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { formatCurrency } from "@/lib/currency"
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface CashSummaryClientProps {
  agencies: Array<{ id: string; name: string }>
  defaultDateFrom: string
  defaultDateTo: string
}

interface AccountBalance {
  id: string
  name: string
  type: string
  currency: string
  current_balance: number
}

interface DailyBalance {
  date: string
  balance: number
}

const chartConfig = {
  balance: {
    label: "Balance",
    theme: {
      light: "hsl(142, 76%, 36%)",
      dark: "hsl(142, 76%, 50%)",
    },
  },
} satisfies ChartConfig

export function CashSummaryClient({ agencies, defaultDateFrom, defaultDateTo }: CashSummaryClientProps) {
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)
  const [accounts, setAccounts] = useState<AccountBalance[]>([])
  const [dailyBalances, setDailyBalances] = useState<DailyBalance[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      // Obtener balances de cuentas financieras
      const accountsResponse = await fetch("/api/accounting/financial-accounts")
      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json()
        setAccounts(accountsData.accounts || [])
      }

      // Obtener evolución diaria de la caja
      const dailyResponse = await fetch(
        `/api/cash/daily-balance?dateFrom=${dateFrom}&dateTo=${dateTo}`
      )
      if (dailyResponse.ok) {
        const dailyData = await dailyResponse.json()
        setDailyBalances(dailyData.dailyBalances || [])
      }
    } catch (error) {
      console.error("Error fetching summary:", error)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  // Calcular KPIs
  const kpis = useMemo(() => {
    const efectivoARS = accounts
      .filter((acc) => acc.type === "CASH_ARS")
      .reduce((sum, acc) => sum + (acc.current_balance || 0), 0)

    const efectivoUSD = accounts
      .filter((acc) => acc.type === "CASH_USD")
      .reduce((sum, acc) => sum + (acc.current_balance || 0), 0)

    const cajaAhorroARS = accounts
      .filter((acc) => acc.type === "SAVINGS_ARS")
      .reduce((sum, acc) => sum + (acc.current_balance || 0), 0)

    const cajaAhorroUSD = accounts
      .filter((acc) => acc.type === "SAVINGS_USD")
      .reduce((sum, acc) => sum + (acc.current_balance || 0), 0)

    return {
      efectivoARS,
      efectivoUSD,
      cajaAhorroARS,
      cajaAhorroUSD,
    }
  }, [accounts])

  // Preparar datos para el gráfico
  const chartData = useMemo(() => {
    return dailyBalances.map((item) => ({
      date: format(new Date(item.date), "dd/MM", { locale: es }),
      Balance: Math.round(item.balance),
    }))
  }, [dailyBalances])

  // Función para formatear números grandes en el eje Y
  const formatYAxisValue = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(0)}M`
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`
    }
    return `$${Math.round(value)}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Resumen de Caja</h1>
        <p className="text-muted-foreground">Monitorea el estado de la caja y su evolución</p>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium">Rango de fechas</label>
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={(from, to) => {
              setDateFrom(from)
              setDateTo(to)
            }}
            placeholder="Seleccionar rango"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Efectivo ARS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.efectivoARS, "ARS")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Efectivo USD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.efectivoUSD, "USD")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Caja Ahorro ARS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.cajaAhorroARS, "ARS")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Caja Ahorro USD</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(kpis.cajaAhorroUSD, "USD")}</div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de evolución */}
      <Card>
        <CardHeader>
          <CardTitle>Evolución de la Caja</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-muted-foreground">Cargando...</p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-muted-foreground">No hay datos disponibles</p>
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[350px] w-full">
              <LineChart 
                data={chartData}
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  tickMargin={8}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  tickMargin={8}
                  axisLine={false}
                  className="text-xs"
                  tickFormatter={formatYAxisValue}
                />
                <ChartTooltip
                  cursor={{ stroke: "hsl(142, 76%, 36%)", strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const value = payload[0].value as number
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="grid gap-2">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-xs text-muted-foreground">Balance</span>
                              <span className="font-semibold">{formatCurrency(value, "ARS")}</span>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="Balance"
                  stroke="hsl(142, 76%, 36%)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, fill: "hsl(142, 76%, 36%)" }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

