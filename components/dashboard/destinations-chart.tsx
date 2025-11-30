"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { useChartColors } from "@/hooks/use-chart-colors"

interface DestinationData {
  destination: string
  totalSales: number
  totalMargin: number
  operationsCount: number
  avgMarginPercent: number
}

interface DestinationsChartProps {
  data: DestinationData[]
}

const chartConfig = {
  Ventas: {
    label: "Ventas",
    theme: {
      light: "hsl(45, 93%, 47%)",
      dark: "hsl(45, 93%, 65%)",
    },
  },
  Operaciones: {
    label: "Operaciones",
    theme: {
      light: "hsl(43, 96%, 56%)",
      dark: "hsl(43, 96%, 70%)",
    },
  },
} satisfies ChartConfig

export function DestinationsChart({ data }: DestinationsChartProps) {
  const colors = useChartColors()
  const chartData = data.map((dest) => ({
    name: dest.destination,
    Ventas: dest.totalSales,
    Operaciones: dest.operationsCount,
  }))

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Destinos</CardTitle>
          <CardDescription>No hay datos disponibles</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Destinos</CardTitle>
        <CardDescription>Ventas y operaciones por destino</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px] w-full sm:h-[300px]">
          <BarChart accessibilityLayer data={chartData} layout="vertical">
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
            />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              width={120}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
            />
            <Bar dataKey="Ventas" fill={colors["1"]} radius={8} />
            <Bar dataKey="Operaciones" fill={colors["2"]} radius={8} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
