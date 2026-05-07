"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { Download, Loader2, CalendarRange } from "lucide-react"
import { toast } from "sonner"

/**
 * Cierre de Mes consolidado en USD.
 *
 * Una fila por mes con: Total Ventas, Margen, − Gastos Fijos, − Gastos
 * Variables, − Comisiones, − Impuestos, = Ganancia Real.
 *
 * Modelo de datos detrás (ver /api/reports/closing):
 * - Ventas/Margen → operations
 * - Fijos/Variables/Impuestos → cash_movements EXPENSE clasificadas por
 *   nombre de categoría (categorías "Gastos oficina", "Sueldos", "Marketing
 *   y sistemas" → Fijos; "Impuestos" → Impuestos; resto → Variables).
 * - Comisiones → commission_records con date_paid en el mes.
 *
 * Multi-moneda: todo se consolida a USD usando FX histórico por fecha.
 */

interface ClosingReportProps {
  agencies: Array<{ id: string; name: string }>
}

interface MonthRow {
  month: string
  monthLabel: string
  total_sales_usd: number
  total_margin_usd: number
  fixed_expenses_usd: number
  variable_expenses_usd: number
  commissions_usd: number
  taxes_usd: number
  real_profit_usd: number
  ops_count: number
}

interface ClosingResponse {
  months: MonthRow[]
  totals: Omit<MonthRow, "month" | "monthLabel">
  meta: {
    from: string
    to: string
    months_count: number
    tax_category: string
    sources: {
      fixed: string
      variable: string
      commissions: string
      taxes: string
    }
  }
}

function formatUsd(amount: number): string {
  return `US$ ${Math.round(amount).toLocaleString("es-AR")}`
}

export function ClosingReport({ agencies }: ClosingReportProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ClosingResponse | null>(null)
  const [months, setMonths] = useState("6")
  const [agencyId, setAgencyId] = useState("ALL")

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        months,
        agencyId: agencyId !== "ALL" ? agencyId : "",
      })
      const res = await fetch(`/api/reports/closing?${params}`)
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setData(result)
    } catch (error: any) {
      toast.error(error.message || "Error al cargar Cierre de Mes")
    } finally {
      setLoading(false)
    }
  }, [months, agencyId])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleExportCSV = () => {
    if (!data) return
    const headers = [
      "Mes",
      "Ops",
      "Total Ventas (USD)",
      "Margen Ventas (USD)",
      "Gastos Fijos (USD)",
      "Gastos Variables (USD)",
      "Comisiones (USD)",
      "Impuestos (USD)",
      "Ganancia Real (USD)",
    ]
    const rows = data.months.map((m) => [
      m.monthLabel,
      m.ops_count,
      Math.round(m.total_sales_usd),
      Math.round(m.total_margin_usd),
      Math.round(m.fixed_expenses_usd),
      Math.round(m.variable_expenses_usd),
      Math.round(m.commissions_usd),
      Math.round(m.taxes_usd),
      Math.round(m.real_profit_usd),
    ])
    rows.push([
      "TOTAL",
      data.totals.ops_count,
      Math.round(data.totals.total_sales_usd),
      Math.round(data.totals.total_margin_usd),
      Math.round(data.totals.fixed_expenses_usd),
      Math.round(data.totals.variable_expenses_usd),
      Math.round(data.totals.commissions_usd),
      Math.round(data.totals.taxes_usd),
      Math.round(data.totals.real_profit_usd),
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map((cell) => `"${cell}"`).join(","))
      .join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `cierre-mes-${data.meta.from}-${data.meta.to}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Cierre de Mes exportado")
  }

  const totals = data?.totals
  const isCurrentMonth = (key: string) => {
    const now = new Date()
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    return key === cur
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>Período</Label>
              <Select value={months} onValueChange={setMonths}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Últimos 3 meses</SelectItem>
                  <SelectItem value="6">Últimos 6 meses</SelectItem>
                  <SelectItem value="12">Últimos 12 meses</SelectItem>
                  <SelectItem value="24">Últimos 24 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Agencia</Label>
              <Select value={agencyId} onValueChange={setAgencyId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas</SelectItem>
                  {agencies.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla principal */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="h-5 w-5" />
              Cierre de Mes
            </CardTitle>
            <CardDescription>
              Vista financiera consolidada en USD — la &quot;ganancia real&quot; después de gastos, comisiones e impuestos
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!data}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.months.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No hay datos en el período seleccionado.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Total Ventas</TableHead>
                    <TableHead className="text-right">Margen Ventas</TableHead>
                    <TableHead className="text-right">− Gastos Fijos</TableHead>
                    <TableHead className="text-right">− Gastos Variables</TableHead>
                    <TableHead className="text-right">− Comisiones</TableHead>
                    <TableHead className="text-right">− Impuestos</TableHead>
                    <TableHead className="text-right bg-muted/40">= Ganancia Real</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.months.map((m) => {
                    const current = isCurrentMonth(m.month)
                    return (
                      <TableRow key={m.month} className={current ? "bg-muted/20" : ""}>
                        <TableCell>
                          <div className={current ? "font-semibold" : "font-medium"}>
                            {m.monthLabel}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {current ? "en curso · " : "cerrado · "}
                            {m.ops_count} ops
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{formatUsd(m.total_sales_usd)}</TableCell>
                        <TableCell className="text-right text-success font-medium">
                          {formatUsd(m.total_margin_usd)}
                        </TableCell>
                        <TableCell className="text-right text-foreground/70">
                          {formatUsd(m.fixed_expenses_usd)}
                        </TableCell>
                        <TableCell className="text-right text-foreground/70">
                          {formatUsd(m.variable_expenses_usd)}
                        </TableCell>
                        <TableCell className="text-right text-foreground/70">
                          {formatUsd(m.commissions_usd)}
                        </TableCell>
                        <TableCell className="text-right text-foreground/70">
                          {formatUsd(m.taxes_usd)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-bold text-base ${
                            m.real_profit_usd >= 0
                              ? "text-success bg-success/5"
                              : "text-destructive bg-destructive/5"
                          }`}
                        >
                          {formatUsd(m.real_profit_usd)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                {totals && data.months.length > 1 && (
                  <TableFooter>
                    <TableRow className="bg-muted/40 font-semibold border-t-2">
                      <TableCell className="uppercase text-xs">
                        Total {data.months.length} meses
                      </TableCell>
                      <TableCell className="text-right">{formatUsd(totals.total_sales_usd)}</TableCell>
                      <TableCell className="text-right text-success">
                        {formatUsd(totals.total_margin_usd)}
                      </TableCell>
                      <TableCell className="text-right">{formatUsd(totals.fixed_expenses_usd)}</TableCell>
                      <TableCell className="text-right">
                        {formatUsd(totals.variable_expenses_usd)}
                      </TableCell>
                      <TableCell className="text-right">{formatUsd(totals.commissions_usd)}</TableCell>
                      <TableCell className="text-right">{formatUsd(totals.taxes_usd)}</TableCell>
                      <TableCell
                        className={`text-right font-bold text-base ${
                          totals.real_profit_usd >= 0
                            ? "text-success bg-success/10"
                            : "text-destructive bg-destructive/10"
                        }`}
                      >
                        {formatUsd(totals.real_profit_usd)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cómo se calcula */}
      {data && (
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="text-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">📐 Cómo se calcula</CardTitle>
            </CardHeader>
            <CardContent>
              <code className="text-[11px] text-muted-foreground leading-relaxed block">
                Ganancia Real =<br />
                Margen Ventas<br />
                − Gastos Fijos<br />
                − Gastos Variables<br />
                − Comisiones<br />
                − Impuestos
              </code>
            </CardContent>
          </Card>
          <Card className="text-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">🗂 Fuentes de datos</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc ml-4">
                <li><b>Ventas / Margen</b>: operaciones (no canceladas)</li>
                <li><b>Fijos</b>: {data.meta.sources.fixed}</li>
                <li><b>Variables</b>: {data.meta.sources.variable}</li>
                <li><b>Comisiones</b>: {data.meta.sources.commissions}</li>
                <li><b>Impuestos</b>: {data.meta.sources.taxes}</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="text-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">💱 Multi-moneda</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Todos los valores se consolidan a <b>USD</b> usando FX histórico por
                fecha del movimiento. Para ver el detalle ARS/USD por bucket, usá la
                pestaña de Márgenes.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
