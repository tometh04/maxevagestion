"use client"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

// `hsl(...)` explicito: los tokens del repo son tripletes sueltos
// (`--chart-1: 232 76% 58%`), asi que `var(--chart-1)` a secas no es un color
// valido y recharts cae a negro sin avisar.
const chartConfig = {
  mrr: { label: "MRR", color: "hsl(var(--chart-1))" },
} satisfies Record<string, { label: string; color: string }>

type Props = {
  data: { label: string; mrr: number }[]
}

export function MrrBarChart({ data }: Props) {
  return (
    <ChartContainer config={chartConfig} className="max-h-64 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <YAxis dataKey="label" type="category" width={160} />
        <XAxis type="number" />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="mrr" fill="var(--color-mrr)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
