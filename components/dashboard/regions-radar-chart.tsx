"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts"
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
  region?: string
}

interface RegionsRadarChartProps {
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
} satisfies ChartConfig

// Función para detectar región basada en el nombre del destino
function detectRegion(destination: string): string {
  const dest = destination.toLowerCase()
  if (dest.includes("argentina") || dest.includes("buenos aires") || dest.includes("bariloche") || dest.includes("mendoza")) {
    return "Argentina"
  }
  if (dest.includes("caribe") || dest.includes("cancún") || dest.includes("punta cana") || dest.includes("jamaica") || dest.includes("bahamas")) {
    return "Caribe"
  }
  if (dest.includes("brasil") || dest.includes("rio") || dest.includes("são paulo")) {
    return "Brasil"
  }
  if (dest.includes("europa") || dest.includes("parís") || dest.includes("londres") || dest.includes("roma") || dest.includes("barcelona") || dest.includes("madrid")) {
    return "Europa"
  }
  if (dest.includes("miami") || dest.includes("new york") || dest.includes("eeuu") || dest.includes("usa")) {
    return "EEUU"
  }
  if (dest.includes("crucero") || dest.includes("cruise")) {
    return "Cruceros"
  }
  return "Otros"
}

export function RegionsRadarChart({ data }: RegionsRadarChartProps) {
  const colors = useChartColors()
  // Agrupar por región detectada
  const regionData = data.reduce((acc, dest) => {
    const regionName = detectRegion(dest.destination)
    if (!acc[regionName]) {
      acc[regionName] = {
        region: regionName,
        ventas: 0,
        operaciones: 0,
        margen: 0,
      }
    }
    acc[regionName].ventas += dest.totalSales
    acc[regionName].operaciones += dest.operationsCount
    acc[regionName].margen += dest.totalMargin
    return acc
  }, {} as Record<string, { region: string; ventas: number; operaciones: number; margen: number }>)

  const chartData = Object.values(regionData)
    .slice(0, 6)
    .map((item) => ({
      region: item.region,
      Ventas: item.ventas / 1000000, // Normalizar a millones
    }))

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ventas por Región</CardTitle>
          <CardDescription>No hay datos disponibles</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium">Ventas por Región</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <RadarChart data={chartData}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <PolarAngleAxis dataKey="region" />
            <PolarGrid />
            <Radar
              dataKey="Ventas"
              fill={colors["1"]}
              fillOpacity={0.6}
              dot={{
                r: 4,
                fillOpacity: 1,
              }}
            />
          </RadarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

