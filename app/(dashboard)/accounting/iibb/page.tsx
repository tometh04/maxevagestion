"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Building2, TrendingDown, TrendingUp, Calculator } from "lucide-react"

export default function IIBBPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/accounting/iibb?year=${year}&month=${month}`)
      if (res.ok) setData(await res.json())
    } catch (err) {
      console.error("Error:", err)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { fetchData() }, [fetchData])

  const formatMoney = (amount: number) =>
    `$ ${Number(amount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" })

  const jurisdictionLabels: Record<string, string> = {
    SANTA_FE: "Santa Fe", BUENOS_AIRES: "Buenos Aires", CABA: "CABA",
    CORDOBA: "Córdoba", MENDOZA: "Mendoza", TUCUMAN: "Tucumán",
    ENTRE_RIOS: "Entre Ríos", OTRO: "Otra",
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground">Cálculo mensual de IIBB — {monthLabel}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Período</Label>
              <Input
                type="month"
                value={`${year}-${String(month).padStart(2, "0")}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-")
                  setYear(parseInt(y))
                  setMonth(parseInt(m))
                }}
                className="w-[180px]"
              />
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
          {/* Info */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="text-sm">
                  <Building2 className="h-3.5 w-3.5 mr-1" />
                  {jurisdictionLabels[data.jurisdiction] || data.jurisdiction}
                </Badge>
                <Badge variant="outline" className="text-sm">
                  Alícuota: {data.iibb_rate}%
                </Badge>
                <Badge variant="outline" className="text-sm">
                  {data.invoices_count} facturas emitidas
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  <span className="text-xs text-muted-foreground">Base Imponible</span>
                </div>
                <p className="text-xl font-bold">{formatMoney(data.base_imponible)}</p>
                <p className="text-xs text-muted-foreground">Total facturado (ARS)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-muted-foreground">IIBB Bruto</span>
                </div>
                <p className="text-xl font-bold text-red-600">{formatMoney(data.iibb_bruto)}</p>
                <p className="text-xs text-muted-foreground">{data.iibb_rate}% de base</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-muted-foreground">Créditos a Favor</span>
                </div>
                <p className="text-xl font-bold text-green-600">{formatMoney(data.creditos.total)}</p>
                <p className="text-xs text-muted-foreground">
                  Perc: {formatMoney(data.creditos.percepciones_iibb)} + Ret: {formatMoney(data.creditos.retenciones_iibb)}
                </p>
              </CardContent>
            </Card>
            <Card className={data.iibb_neto > 0 ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <Calculator className="h-4 w-4" />
                  <span className="text-xs text-muted-foreground">IIBB Neto a Pagar</span>
                </div>
                <p className={`text-xl font-bold ${data.iibb_neto > 0 ? "text-red-700" : "text-green-700"}`}>
                  {formatMoney(data.iibb_neto)}
                </p>
                <p className="text-xs text-muted-foreground">Bruto - Créditos</p>
              </CardContent>
            </Card>
          </div>

          {/* Desglose */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desglose del Cálculo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm">Base imponible (facturación del mes en ARS)</span>
                  <span className="font-medium">{formatMoney(data.base_imponible)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm">× Alícuota IIBB ({data.iibb_rate}%)</span>
                  <span className="font-medium text-red-600">= {formatMoney(data.iibb_bruto)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm">- Percepciones IIBB sufridas</span>
                  <span className="font-medium text-green-600">- {formatMoney(data.creditos.percepciones_iibb)}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-sm">- Retenciones IIBB sufridas</span>
                  <span className="font-medium text-green-600">- {formatMoney(data.creditos.retenciones_iibb)}</span>
                </div>
                <div className="flex justify-between py-2 font-bold text-lg">
                  <span>= IIBB Neto a Pagar</span>
                  <span className={data.iibb_neto > 0 ? "text-red-700" : "text-green-700"}>
                    {formatMoney(data.iibb_neto)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
