"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Pie, PieChart, Cell } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Loader2, PieChart as PieChartIcon } from "lucide-react"
// Fix UTC shift en fechas DATE (VICO 2026-05-22)
import { formatDateOnlyLocal } from "@/lib/utils/date-only"

// Paleta categórica de respaldo (para categorías sin color propio). Tonos
// distinguibles que funcionan en light/dark. La categoría usa su color propio
// cuando lo tiene; esta paleta sólo cubre huecos y mantiene consistencia.
const FALLBACK_PALETTE = [
  "hsl(45, 93%, 50%)",   // amber
  "hsl(24, 90%, 55%)",   // orange
  "hsl(142, 64%, 45%)",  // green
  "hsl(190, 80%, 45%)",  // cyan
  "hsl(340, 75%, 55%)",  // pink/red
  "hsl(262, 70%, 60%)",  // violet
  "hsl(210, 80%, 55%)",  // blue
  "hsl(160, 60%, 42%)",  // teal
  "hsl(15, 80%, 55%)",   // coral
  "hsl(85, 60%, 45%)",   // lime
]

interface Expense {
  id: string
  expense_type: "recurring" | "variable"
  category: string | null
  category_color: string | null
  amount: number
  currency: string
}

interface CategorySlice {
  category: string
  total: number
  share: number
  color: string
}

interface ExpensesSummaryTabProps {
  agencies: Array<{ id: string; name: string }>
}

export function ExpensesSummaryTab({ agencies }: ExpensesSummaryTabProps) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return formatDateOnlyLocal(d) ?? ""
  })
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    d.setDate(0) // último día del mes actual
    return formatDateOnlyLocal(d) ?? ""
  })
  const [currency, setCurrency] = useState("ARS")
  const [agencyFilter, setAgencyFilter] = useState("ALL")
  // Criterio del filtro por agencia: "office" = oficina a la que se cargó el
  // gasto; "account" = oficina de la cuenta desde la que salió la plata.
  const [agencyMode, setAgencyMode] = useState<"office" | "account">("office")

  const fetchExpenses = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, currency })
      if (agencyFilter !== "ALL") {
        params.set("agencyId", agencyFilter)
        params.set("agencyMode", agencyMode)
      }

      const res = await fetch(`/api/expenses/monthly?${params}`)
      if (res.ok) {
        const data = await res.json()
        setExpenses(data.expenses || [])
      } else {
        setExpenses([])
      }
    } catch (err) {
      console.error("Error fetching expenses summary:", err)
      setExpenses([])
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, currency, agencyFilter, agencyMode])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount)

  // Agrupar por categoría, sumar y calcular % del total.
  const { slices, total } = useMemo(() => {
    const grouped = new Map<string, { total: number; color: string | null }>()
    for (const e of expenses) {
      const name = e.category?.trim() || "Sin categoría"
      const prev = grouped.get(name)
      grouped.set(name, {
        total: (prev?.total || 0) + Number(e.amount || 0),
        color: prev?.color || e.category_color || null,
      })
    }

    const totalSum = Array.from(grouped.values()).reduce((acc, g) => acc + g.total, 0)

    const result: CategorySlice[] = Array.from(grouped.entries())
      .map(([category, g]) => ({
        category,
        total: g.total,
        share: totalSum > 0 ? (g.total / totalSum) * 100 : 0,
        dbColor: g.color,
      }))
      .sort((a, b) => b.total - a.total)
      // Asignar color tras ordenar: la categoría usa su color propio si lo tiene;
      // si no, un tono de la paleta según su posición (tonos consecutivos y
      // distinguibles, de mayor a menor gasto).
      .map(({ dbColor, ...s }, i) => ({
        ...s,
        color: dbColor || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
      }))

    return { slices: result, total: totalSum }
  }, [expenses])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Desde</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Hasta</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Moneda</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ARS">ARS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {agencies.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Ver por</Label>
            <Select value={agencyMode} onValueChange={(v) => setAgencyMode(v as "office" | "account")}>
              <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="office">Oficina del gasto</SelectItem>
                <SelectItem value="account">Cuenta pagadora</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {agencies.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Agencia</Label>
            <Select value={agencyFilter} onValueChange={setAgencyFilter}>
              <SelectTrigger className="h-8 text-xs rounded-full border-border/60 bg-background min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                {agencies.map((agency) => (
                  <SelectItem key={agency.id} value={agency.id}>
                    {agency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : slices.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No hay gastos en {currency} en el período seleccionado
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Torta */}
          <div className="rounded-xl border border-border/40 p-5">
            <div className="flex items-center gap-2 mb-3">
              <PieChartIcon className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Distribución de gastos ({currency})</span>
            </div>
            <ChartContainer config={{}} className="h-[280px] w-full">
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => (
                        <div className="flex items-center justify-between gap-3 w-full">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-medium tabular-nums">{formatCurrency(Number(value))}</span>
                        </div>
                      )}
                    />
                  }
                />
                <Pie
                  data={slices}
                  dataKey="total"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius="75%"
                  label={({ percent }) => (percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : "")}
                  labelLine={false}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.category} fill={slice.color} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>

          {/* Tabla Categoría | Total | % */}
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right w-[90px]">% del total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slices.map((slice) => (
                  <TableRow key={slice.category}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-sm shrink-0"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="text-sm font-medium">{slice.category}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(slice.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {slice.share.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCurrency(total)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">100%</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
