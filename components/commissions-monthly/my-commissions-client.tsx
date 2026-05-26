"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, TrendingUp, Target, BarChart3, DollarSign } from "lucide-react"

interface Props {
  sellerId: string
  sellerName: string
  hasRule: boolean
}

interface SimulationData {
  seller: { id: string; name: string; email: string }
  year_month: string
  rule: any
  simulation: any
}

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function listLast12Months(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = []
  const today = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
    out.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return out
}

function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—"
  return `USD ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return "—"
  return `${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

export function MyCommissionsMonthlyClient({ sellerId, sellerName, hasRule }: Props) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth())
  const [data, setData] = useState<SimulationData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasRule) return
    setLoading(true)
    setError(null)
    fetch(`/api/commissions/monthly/simulate/${sellerId}/${yearMonth}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json()
          throw new Error(e.error || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sellerId, yearMonth, hasRule])

  if (!hasRule) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mi comisión mensual</h1>
          <p className="text-muted-foreground">
            Todavía no tenés una regla de comisión mensual configurada. Pedile a tu admin que la cree.
          </p>
        </div>
      </div>
    )
  }

  const sim = data?.simulation
  const months = listLast12Months()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mi comisión mensual</h1>
          <p className="text-muted-foreground">
            Simulación en tiempo real — {sellerName}
          </p>
        </div>
        <Select value={yearMonth} onValueChange={setYearMonth}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculando...
        </div>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 text-destructive">{error}</CardContent>
        </Card>
      )}

      {sim && !loading && (
        <>
          {/* Comisión final destacada */}
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground uppercase tracking-wide">
                    Comisión estimada del mes
                  </p>
                  <p className="text-4xl font-bold mt-2">
                    {formatUsd(sim.final_commission_usd)}
                  </p>
                  {sim.retroactive_adjustment_usd !== 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Incluye ajuste retroactivo: {formatUsd(sim.retroactive_adjustment_usd)}
                    </p>
                  )}
                </div>
                <DollarSign className="h-12 w-12 text-primary/50" />
              </div>
            </CardContent>
          </Card>

          {/* Componentes del cálculo */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  Margen acumulado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-3xl font-semibold">{formatUsd(sim.total_margin_usd)}</div>
                <div className="text-sm text-muted-foreground">
                  No comisionable: {formatUsd(sim.non_commissionable_amount_usd)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Excedente: {formatUsd(sim.excess_usd)}
                </div>
                <Badge variant="secondary">
                  Tramo aplicado: {formatPct(sim.bracket_applied_pct)}
                </Badge>
                <div className="text-sm pt-2 border-t">
                  <span className="text-muted-foreground">Comisión base:</span>{" "}
                  <strong>{formatUsd(sim.base_commission_usd)}</strong>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-accent-violet" />
                  Factor de desempeño
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-3xl font-semibold">{formatPct(sim.performance_factor_pct)}</div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Ventas:</span>{" "}
                  <strong>{formatPct(sim.sales_component_pct)}</strong>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Gestión:</span>{" "}
                  <strong>{formatPct(sim.mgmt_component_pct)}</strong>
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t space-y-0.5">
                  <div>· Conv. cotizaciones: {formatPct(sim.mgmt_quotations_indicator_pct)}</div>
                  <div>· Conv. leads: {formatPct(sim.mgmt_leads_indicator_pct)}</div>
                  {sim.mgmt_manual_indicator_pct != null && (
                    <div>· Auditoría (admin): {formatPct(sim.mgmt_manual_indicator_pct)}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detalle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Detalle del mes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Ventas cerradas</p>
                  <p className="font-semibold">{sim.sales_closed_count}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Cotizaciones enviadas</p>
                  <p className="font-semibold">{sim.quotations_sent_count}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Leads recibidos</p>
                  <p className="font-semibold">{sim.leads_received_count}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Conv. cotizaciones</p>
                  <p className="font-semibold">
                    {(sim.breakdown.conv_quotations_rate * 100).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Conv. leads</p>
                  <p className="font-semibold">
                    {(sim.breakdown.conv_leads_rate * 100).toFixed(2)}%
                  </p>
                </div>
              </div>

              {sim.breakdown.operations.length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Operaciones contadas ({sim.breakdown.operations.length})
                  </p>
                  <div className="space-y-1 text-xs max-h-48 overflow-y-auto">
                    {sim.breakdown.operations.map((op: any) => (
                      <div key={op.id} className="flex justify-between text-muted-foreground">
                        <span className="font-mono">{op.id.slice(0, 8)}…</span>
                        <span>
                          Margen {formatUsd(op.margin_usd)}
                          {op.split_pct !== 100 && ` × ${op.split_pct}% = ${formatUsd(op.counted_margin_usd)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground pt-2 border-t">
                Esta es una simulación basada en tu actividad del mes. La liquidación final
                se aprueba el 15 del mes siguiente y puede tener ajustes (ej: indicador
                de auditoría cargado por tu admin).
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
