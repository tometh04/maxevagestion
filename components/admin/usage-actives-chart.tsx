"use client"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import type { UsageActiveUsersRow } from "@/lib/admin/usage"

// Tres series, una sola unidad (personas) y un solo eje. Lineas y no barras
// porque la pregunta es la forma en el tiempo, no la comparacion punto a punto.
//
// `hsl(...)` explicito: los tokens del repo son tripletes sueltos, asi que
// `var(--chart-1)` a secas no es un color valido y recharts cae a negro.
const chartConfig = {
  dau: { label: "Diarios", color: "hsl(var(--chart-1))" },
  wau: { label: "Semanales", color: "hsl(var(--chart-2))" },
  mau: { label: "Mensuales", color: "hsl(var(--chart-3))" },
} satisfies Record<string, { label: string; color: string }>

type Props = { rows: UsageActiveUsersRow[]; days: number }

export function UsageActivesChart({ rows, days }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin actividad en el periodo.</p>
  }

  const data = [...rows]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => {
      const [, m, d] = r.day.split("-")
      return { label: `${Number(d)}/${Number(m)}`, dau: r.dau, wau: r.wau, mau: r.mau }
    })

  const tickStep = days > 30 ? 10 : days > 7 ? 3 : 1

  return (
    <div className="space-y-2">
      <ChartContainer config={chartConfig} className="max-h-56 w-full">
        <LineChart data={data} margin={{ left: 4, right: 8, top: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            fontSize={10}
            interval={tickStep - 1}
          />
          <YAxis width={28} tickLine={false} axisLine={false} fontSize={10} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line dataKey="mau" stroke="var(--color-mau)" strokeWidth={2} dot={false} />
          <Line dataKey="wau" stroke="var(--color-wau)" strokeWidth={2} dot={false} />
          <Line dataKey="dau" stroke="var(--color-dau)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>

      {/* Con tres series la leyenda no es opcional: la identidad no puede
          quedar solo en el color. */}
      <div className="flex flex-wrap items-center gap-4 pl-8 text-[11px] text-muted-foreground">
        {Object.entries(chartConfig).map(([key, cfg]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: cfg.color }}
              aria-hidden
            />
            {cfg.label}
          </span>
        ))}
      </div>
    </div>
  )
}
