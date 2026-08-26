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

interface InvoicingSummaryResponse {
  operation: {
    id: string
    file_code: string
    destination: string
    sale_amount_total: number
    margin_amount: number
    /** Moneda de la venta: la venta y lo facturado se expresan en ella. */
    sale_currency?: string | null
    customer: { id: string; name: string } | null
    customers?: CustomerBreakdown[]
    has_afip_emisor: boolean
  }
  summary: {
    /** VIB-157: la base es la venta total, no el margen. */
    sale_total: number
    already_invoiced: number
    remaining: number
    invoiced_pct: number
    remaining_pct: number
    can_invoice: boolean
    reason_disabled:
      | "no_sale_amount"
      | "no_customer"
      | "no_afip"
      | "already_fully_invoiced"
      | null
    unconverted_count: number
  }
  invoices: Array<{
    id: string
    cbte_nro: number | null
    pto_vta: number
    cbte_tipo: number
    imp_total: number
    /** Moneda del comprobante (PES/DOL): puede diferir de la de la venta. */
    moneda?: string | null
    fecha_emision: string | null
    status: string
    verification_status: string | null
    cae: string | null
  }>
}

const REASON_TEXT: Record<string, string> = {
  no_sale_amount: "Esta operación no tiene monto de venta cargado",
  no_customer: "Asigná un cliente a la operación primero",
  no_afip: "Configurá AFIP en Integraciones primero",
  already_fully_invoiced: "Ya facturada completa",
}

// VIB-151: una venta puede estar en USD y facturarse en pesos. Mostrar todo con
// "$" hacía leer un margen de USD 8.050 como si fueran pesos.
const fmtMoney = (n: number, currency: "ARS" | "USD" = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n)

const invoiceCurrency = (moneda?: string | null): "ARS" | "USD" =>
  String(moneda ?? "PES").toUpperCase() === "DOL" ? "USD" : "ARS"

const fmtPct = (n: number) =>
  `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n)}%`

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
  const [data, setData] = useState<InvoicingSummaryResponse | null>(null)
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
      .then((d: InvoicingSummaryResponse) => {
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
  const saleCurrency: "ARS" | "USD" = data.operation.sale_currency === "USD" ? "USD" : "ARS"

  const disabledReasonText = summary.reason_disabled
    ? REASON_TEXT[summary.reason_disabled]
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" />
          Facturación de la operación
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats — la base es la venta total del paquete (VIB-157) */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Venta total</div>
            <div className="font-semibold">{fmtMoney(summary.sale_total, saleCurrency)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Ya facturado</div>
            <div className="font-semibold">{fmtMoney(summary.already_invoiced, saleCurrency)}</div>
            <div className="text-xs text-muted-foreground">{fmtPct(summary.invoiced_pct)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Falta facturar</div>
            <div className="font-semibold">{fmtMoney(summary.remaining, saleCurrency)}</div>
            <div className="text-xs text-muted-foreground">{fmtPct(summary.remaining_pct)}</div>
          </div>
        </div>

        {/* Progress */}
        {summary.sale_total > 0 && (
          <Progress value={summary.invoiced_pct} className="h-2" />
        )}

        {/* Facturas que no se pudieron valuar en la moneda de la venta: el
            restante que se muestra puede ser mayor que el real. */}
        {summary.unconverted_count > 0 && (
          <div className="flex items-start gap-2 text-xs text-accent-coral">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {summary.unconverted_count === 1
                ? "Hay 1 factura en otra moneda sin tipo de cambio del día: no está contada en el total facturado."
                : `Hay ${summary.unconverted_count} facturas en otra moneda sin tipo de cambio del día: no están contadas en el total facturado.`}
            </span>
          </div>
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
                    Facturado: <span className="font-mono text-foreground">{fmtMoney(c.invoiced, saleCurrency)}</span>
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
            {(data.operation.customers?.length || 0) > 1 ? "Facturar (elegir cliente)" : "Facturar"}
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
                    <span>{fmtMoney(inv.imp_total, invoiceCurrency(inv.moneda))}</span>
                    <span className="text-muted-foreground text-xs">•</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(inv.fecha_emision)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isAuthorized && (
                      <Badge variant="secondary" className="text-xs">{inv.status}</Badge>
                    )}
                    {isAuthorized && inv.verification_status === "verified" && (
                      <Badge variant="outline" className="text-xs text-success border-success">
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
