"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Receipt, ExternalLink, CheckCircle2, AlertCircle, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface CustomerBreakdown {
  id: string
  name: string
  role: "MAIN" | "COMPANION"
  invoiced: number
}

interface MarginSummaryResponse {
  operation: {
    id: string
    file_code: string
    destination: string
    margin_amount: number
    customer: { id: string; name: string } | null
    customers?: CustomerBreakdown[]
    has_afip_emisor: boolean
  }
  summary: {
    margin_total: number
    already_invoiced: number
    remaining: number
    can_invoice: boolean
    reason_disabled: "no_margin" | "no_customer" | "no_afip" | "already_fully_invoiced" | null
  }
  invoices: Array<{
    id: string
    cbte_nro: number | null
    pto_vta: number
    cbte_tipo: number
    imp_total: number
    fecha_emision: string | null
    status: string
    verification_status: string | null
    cae: string | null
  }>
}

const REASON_TEXT: Record<string, string> = {
  no_margin: "Esta operación no tiene margen (costo ≥ venta)",
  no_customer: "Asigná un cliente a la operación primero",
  no_afip: "Configurá AFIP en Integraciones primero",
  already_fully_invoiced: "Ya facturada completa",
}

const fmtARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n)

const fmtDate = (s: string | null) => {
  if (!s) return "-"
  try {
    return new Date(s).toLocaleDateString("es-AR")
  } catch {
    return s
  }
}

export function OperationFacturacionSection({ operationId }: { operationId: string }) {
  const router = useRouter()
  const [data, setData] = useState<MarginSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/operations/${operationId}/margin-summary`)
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
          throw new Error(err.error || "Error al cargar")
        }
        return r.json()
      })
      .then((d: MarginSummaryResponse) => {
        if (!cancelled) setData(d)
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message || "Error de red")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [operationId])

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const { summary, invoices } = data
  const pct = summary.margin_total > 0
    ? Math.min(100, (summary.already_invoiced / summary.margin_total) * 100)
    : 0

  const disabledReasonText = summary.reason_disabled
    ? REASON_TEXT[summary.reason_disabled]
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" />
          Facturación de ganancia
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Margen total</div>
            <div className="font-semibold">{fmtARS(summary.margin_total)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Ya facturado</div>
            <div className="font-semibold">{fmtARS(summary.already_invoiced)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Restante</div>
            <div className="font-semibold text-emerald-600">{fmtARS(summary.remaining)}</div>
          </div>
        </div>

        {/* Progress */}
        {summary.margin_total > 0 && (
          <Progress value={pct} className="h-2" />
        )}

        {/* Per-customer breakdown when there are multiple passengers — facturación múltiple */}
        {(data.operation.customers?.length || 0) > 1 && (
          <div className="border rounded-md p-3 space-y-2 bg-muted/20">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Users className="h-3 w-3" />
              Pasajeros
            </div>
            {data.operation.customers?.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span>{c.name || "—"}</span>
                  {c.role === "MAIN" && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">titular</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    Facturado: <span className="font-mono text-foreground">{fmtARS(c.invoiced)}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={!summary.can_invoice}
                    onClick={() =>
                      router.push(
                        `/operations/billing/new?operationId=${operationId}&customerId=${c.id}`,
                      )
                    }
                  >
                    Facturar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action button — siempre visible para 1 cliente o como fallback */}
        <div>
          <Button
            onClick={() => router.push(`/operations/billing/new?operationId=${operationId}`)}
            disabled={!summary.can_invoice}
            className="w-full sm:w-auto"
          >
            <Receipt className="h-4 w-4 mr-2" />
            {(data.operation.customers?.length || 0) > 1 ? "Facturar (elegir cliente)" : "Facturar ganancia"}
          </Button>
          {disabledReasonText && (
            <p className="text-xs text-muted-foreground mt-2">{disabledReasonText}</p>
          )}
        </div>

        {/* Invoices list */}
        {invoices.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Facturas emitidas
            </div>
            {invoices.map((inv) => {
              const nroStr = inv.cbte_nro
                ? `${String(inv.pto_vta).padStart(4, "0")}-${String(inv.cbte_nro).padStart(8, "0")}`
                : "(draft)"
              const tipoLabel = inv.cbte_tipo === 1 ? "A" : inv.cbte_tipo === 6 ? "B" : inv.cbte_tipo === 11 ? "C" : inv.cbte_tipo === 19 ? "E" : `T${inv.cbte_tipo}`
              const isAuthorized = inv.status === "authorized"
              return (
                <div
                  key={inv.id}
                  className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{tipoLabel} {nroStr}</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span>{fmtARS(inv.imp_total)}</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(inv.fecha_emision)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isAuthorized && (
                      <Badge variant="secondary" className="text-xs">{inv.status}</Badge>
                    )}
                    {isAuthorized && inv.verification_status === "verified" && (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Verificada
                      </Badge>
                    )}
                    {isAuthorized && inv.verification_status === "discrepancy" && (
                      <Badge variant="destructive" className="text-xs">Discrepancia</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => router.push(`/operations/billing?id=${inv.id}`)}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
