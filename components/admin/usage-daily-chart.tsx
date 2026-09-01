"use client"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import type { UsageDailyRow } from "@/lib/admin/usage"

// `hsl(...)` explicito: los tokens del repo son tripletes sueltos
// (`--chart-1: 232 76% 58%`), asi que `var(--chart-1)` a secas no es un color
// valido y recharts cae a negro sin avisar.
const chartConfig = {
  value: { label: "Activas", color: "hsl(var(--chart-1))" },
} satisfies Record<string, { label: string; color: string }>

type Props = {
  rows: UsageDailyRow[]
  days: number
  /**
   * Qué se cuenta. Con una org elegida, contar organizaciones distintas daría
   * una línea plana en 1 — lo que interesa ahí son sus personas.
   */
  metric?: "orgs" | "users"
}

/**
 * Serie completa: la RPC solo devuelve dias con actividad, y un fin de semana
 * vacio que se omite en vez de dibujarse en cero deforma la tendencia.
 */
function fillGaps(rows: UsageDailyRow[], days: number, metric: "orgs" | "users") {
  const byDay = new Map(
    rows.map((r) => [r.day, metric === "users" ? r.active_users : r.active_orgs])
  )
  const out: { label: string; day: string; value: number }[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    out.push({
      day: key,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      value: byDay.get(key) ?? 0,
    })
  }
  return out
}

/**
 * Agencias activas por dia, y no acciones por dia: el volumen crudo lo domina
 * cualquier import masivo (una sola org metiendo 6.500 clientes en una tarde
 * deja el resto del mes como una linea plana). El conteo de agencias esta
 * acotado y es el pulso real de retencion.
 */
export function UsageDailyChart({ rows, days, metric = "orgs" }: Props) {
  const data = fillGaps(rows, days, metric)
  // Con 90 barras las etiquetas se pisan; una cada ~10 alcanza para ubicarse.
  const tickStep = days > 30 ? 10 : days > 7 ? 3 : 1

  return (
    <ChartContainer config={chartConfig} className="max-h-56 w-full">
      <BarChart data={data} margin={{ left: 4, right: 4, top: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={10}
          interval={tickStep - 1}
        />
        <YAxis width={28} tickLine={false} axisLine={false} fontSize={10} allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={2} />
      </BarChart>
    </ChartContainer>
  )
}
