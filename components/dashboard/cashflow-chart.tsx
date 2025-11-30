"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useChartColors } from "@/hooks/use-chart-colors"

interface CashflowData {
  date: string
  income: number
  expense: number
  net: number
}

interface CashflowChartProps {
  data: CashflowData[]
}

const chartConfig = {
  Ingresos: {
    label: "Ingresos",
    theme: {
      light: "hsl(45, 93%, 47%)",
      dark: "hsl(45, 93%, 65%)",
    },
  },
  Egresos: {
    label: "Egresos",
    theme: {
      light: "hsl(43, 96%, 56%)",
      dark: "hsl(43, 96%, 70%)",
    },
  },
  Neto: {
    label: "Neto",
    theme: {
      light: "hsl(37, 92%, 50%)",
      dark: "hsl(37, 92%, 63%)",
    },
  },
} satisfies ChartConfig

export function CashflowChart({ data }: CashflowChartProps) {
  const colors = useChartColors()
  const chartData = data.map((item) => ({
    date: format(new Date(item.date), "dd/MM", { locale: es }),
    Ingresos: item.income,
    Egresos: item.expense,
    Neto: item.net,
  }))

  if (chartData.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Flujo de Caja</CardTitle>
          <CardDescription>Ingresos, egresos y flujo neto en el tiempo</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[calc(100%-80px)] text-center text-muted-foreground space-y-2 p-6">
          <p className="text-sm">No hay movimientos de caja en el rango de fechas seleccionado.</p>
          <p className="text-xs">Los movimientos de caja se crean cuando se marcan pagos como pagados.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Flujo de Caja</CardTitle>
        <CardDescription>Ingresos, egresos y flujo neto en el tiempo</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full sm:h-[300px]">
          <LineChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <YAxis
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="Ingresos"
              stroke={colors["1"]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="Egresos"
              stroke={colors["2"]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="Neto"
              stroke={colors["3"]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
