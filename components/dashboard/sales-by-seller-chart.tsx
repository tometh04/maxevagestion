"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { useChartColors } from "@/hooks/use-chart-colors"

interface SellerData {
  id?: string
  sellerId?: string
  sellerName?: string
  name?: string
  totalSales: number
  totalMargin: number
  margin?: number
  operationsCount: number
  avgMarginPercent: number
}

interface SalesBySellerChartProps {
  data: SellerData[]
}

const chartConfig = {
  Ventas: {
    label: "Ventas",
    theme: {
      light: "hsl(45, 93%, 47%)",
      dark: "hsl(45, 93%, 65%)",
    },
  },
  Margen: {
    label: "Margen",
    theme: {
      light: "hsl(43, 96%, 56%)",
      dark: "hsl(43, 96%, 70%)",
    },
  },
} satisfies ChartConfig

export function SalesBySellerChart({ data }: SalesBySellerChartProps) {
  const colors = useChartColors()
  const chartData = data.map((seller) => ({
    name: seller.name || seller.sellerName || "Sin nombre",
    Ventas: seller.totalSales,
    Margen: seller.totalMargin || seller.margin || 0,
  }))

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ventas por Vendedor</CardTitle>
          <CardDescription>No hay datos disponibles</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium">Ventas por Vendedor</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
            />
            <Bar dataKey="Ventas" fill={colors["1"]} radius={8} />
            <Bar dataKey="Margen" fill={colors["2"]} radius={8} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
