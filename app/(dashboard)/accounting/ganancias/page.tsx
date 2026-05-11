"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, TrendingUp, TrendingDown, Calculator, DollarSign, Percent } from "lucide-react"

export default function GananciasPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3))

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/accounting/ganancias?year=${year}&quarter=${quarter}`)
      if (res.ok) setData(await res.json())
    } catch (err) {
      console.error("Error:", err)
    } finally {
      setLoading(false)
    }
  }, [year, quarter])

  useEffect(() => { fetchData() }, [fetchData])

  const formatMoney = (amount: number, currency: string = "ARS") => {
    const prefix = currency === "USD" ? "US$" : "$"
    return `${prefix} ${Number(amount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const quarterLabel = `Q${quarter} ${year} (${["Ene-Mar", "Abr-Jun", "Jul-Sep", "Oct-Dic"][quarter - 1]})`

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground">Provisión trimestral estimada — {quarterLabel}</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Año</Label>
              <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2027">2027</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Trimestre</Label>
              <Select value={String(quarter)} onValueChange={v => setQuarter(parseInt(v))}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Q1 — Enero a Marzo</SelectItem>
                  <SelectItem value="2">Q2 — Abril a Junio</SelectItem>
                  <SelectItem value="3">Q3 — Julio a Septiembre</SelectItem>
                  <SelectItem value="4">Q4 — Octubre a Diciembre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <span className="text-xs text-muted-foreground">Ingresos (Márgenes)</span>
                </div>
                <p className="text-lg font-bold text-success">{formatMoney(data.ingresos.margin_usd, "USD")}</p>
                {data.ingresos.margin_ars > 0 && (
                  <p className="text-sm text-success">+ {formatMoney(data.ingresos.margin_ars)}</p>
                )}
                <p className="text-xs text-muted-foreground">{data.ingresos.operations_count} operaciones</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <span className="text-xs text-muted-foreground">Gastos + Comisiones</span>
                </div>
                <p className="text-lg font-bold text-destructive">{formatMoney(data.gastos.total_usd, "USD")}</p>
                {data.gastos.total_ars > 0 && (
                  <p className="text-sm text-destructive">+ {formatMoney(data.gastos.total_ars)}</p>
                )}
                <p className="text-xs text-muted-foreground">Comisiones: {formatMoney(data.gastos.comisiones, "USD")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-accent-violet" />
                  <span className="text-xs text-muted-foreground">Resultado antes de Imp.</span>
                </div>
                <p className={`text-lg font-bold ${data.resultado.profit_before_tax_usd >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatMoney(data.resultado.profit_before_tax_usd, "USD")}
                </p>
                {data.resultado.profit_before_tax_ars !== 0 && (
                  <p className="text-sm">{formatMoney(data.resultado.profit_before_tax_ars)}</p>
                )}
              </CardContent>
            </Card>
            <Card className="border-accent-coral/15 bg-accent-coral/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <Percent className="h-4 w-4 text-accent-coral" />
                  <span className="text-xs text-muted-foreground">Provisión Ganancias ({data.provision.rate}%)</span>
                </div>
                <p className="text-lg font-bold text-accent-coral">{formatMoney(data.provision.estimated_usd, "USD")}</p>
                {data.provision.estimated_ars > 0 && (
                  <p className="text-sm text-accent-coral">+ {formatMoney(data.provision.estimated_ars)}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Ret. sufridas: {formatMoney(data.provision.retenciones_sufridas)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Desglose */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desglose del Cálculo</CardTitle>
              <CardDescription>Estimación simplificada — consultar con el contador para la DDJJ formal</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm font-medium">Ingresos (márgenes de operaciones)</span>
                  <div className="text-right">
                    <p className="font-medium text-success">{formatMoney(data.ingresos.margin_usd, "USD")}</p>
                    {data.ingresos.margin_ars > 0 && <p className="text-sm text-success">{formatMoney(data.ingresos.margin_ars)}</p>}
                  </div>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm">- Gastos operativos</span>
                  <div className="text-right">
                    <p className="font-medium text-destructive">- {formatMoney(data.gastos.total_usd, "USD")}</p>
                    {data.gastos.total_ars > 0 && <p className="text-sm text-destructive">- {formatMoney(data.gastos.total_ars)}</p>}
                  </div>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm">- Comisiones vendedores</span>
                  <p className="font-medium text-destructive">- {formatMoney(data.gastos.comisiones, "USD")}</p>
                </div>
                <div className="flex justify-between py-2 border-b bg-muted/30 px-2 rounded">
                  <span className="text-sm font-bold">= Resultado antes de impuestos</span>
                  <p className={`font-bold ${data.resultado.profit_before_tax_usd >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatMoney(data.resultado.profit_before_tax_usd, "USD")}
                  </p>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm">× Alícuota Ganancias ({data.provision.rate}%)</span>
                  <p className="font-medium text-accent-coral">= {formatMoney(data.provision.estimated_usd, "USD")}</p>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm">- Retenciones de Ganancias sufridas</span>
                  <p className="font-medium text-success">- {formatMoney(data.provision.retenciones_sufridas)}</p>
                </div>
                <div className="flex justify-between py-3 font-bold text-lg">
                  <span>= Provisión Neta Estimada</span>
                  <p className="text-accent-coral">{formatMoney(data.provision.neto_ars)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-accent-coral/15 bg-accent-coral/5">
            <CardContent className="pt-6">
              <p className="text-sm text-accent-coral">
                <strong>Nota:</strong> Esta es una estimación simplificada para provisión interna.
                La DDJJ formal de Ganancias requiere ajustes por inflación, diferencias de cambio,
                deducciones especiales y otros conceptos que debe calcular el contador.
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
