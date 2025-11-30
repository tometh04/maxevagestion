"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Pie, PieChart, Cell } from "recharts"
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

interface DestinationsPieChartProps {
  data: DestinationData[]
}

const chartConfig = {
  Ventas: {
    label: "Ventas",
  },
  argentin: {
    label: "Argentina",
    theme: {
      light: "hsl(45, 93%, 47%)",
      dark: "hsl(45, 93%, 65%)",
    },
  },
  caribe: {
    label: "Caribe",
    theme: {
      light: "hsl(43, 96%, 56%)",
      dark: "hsl(43, 96%, 70%)",
    },
  },
  brasil: {
    label: "Brasil",
    theme: {
      light: "hsl(37, 92%, 50%)",
      dark: "hsl(37, 92%, 63%)",
    },
  },
  europa: {
    label: "Europa",
    theme: {
      light: "hsl(48, 96%, 53%)",
      dark: "hsl(48, 96%, 68%)",
    },
  },
  eeuu: {
    label: "EEUU",
    theme: {
      light: "hsl(50, 95%, 58%)",
      dark: "hsl(50, 95%, 73%)",
    },
  },
  otros: {
    label: "Otros",
    theme: {
      light: "hsl(35, 90%, 55%)",
      dark: "hsl(35, 90%, 68%)",
    },
  },
} satisfies ChartConfig

export function DestinationsPieChart({ data }: DestinationsPieChartProps) {
  const colors = useChartColors()
  const colorArray = [colors["1"], colors["2"], colors["3"], colors["4"], colors["5"]]
  
  // Usar top 5 destinos
  const chartData = data.slice(0, 5).map((dest, index) => {
    return {
      destination: dest.destination.length > 20 
        ? dest.destination.substring(0, 20) + "..." 
        : dest.destination,
      ventas: dest.totalSales,
      color: colorArray[index % colorArray.length],
    }
  })

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Distribución de Ventas</CardTitle>
          <CardDescription>No hay datos disponibles</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución de Ventas</CardTitle>
        <CardDescription>Top 5 destinos por ventas</CardDescription>
      </CardHeader>
      <CardContent className="overflow-hidden">
        <ChartContainer config={chartConfig} className="h-[250px] w-full sm:h-[300px]">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="ventas"
              nameKey="destination"
              cx="50%"
              cy="50%"
              outerRadius="60%"
              label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

