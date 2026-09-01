"use client"

import * as React from "react"
import { CreditCard, FileText, Loader2, Plus, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import type { QuotationCreditPackage, QuotationQuotaUsage } from "@/lib/quotation-quota/types"
import { formatArs } from "@/lib/billing/plans"

type QuotaPayload = {
  usage: QuotationQuotaUsage
  packages: QuotationCreditPackage[]
  can_manage_billing: boolean
  emissions: Array<{
    id: string
    quotation_number: string
    sequence: number
    agency_name: string
    generated_by_name: string
    created_at: string
  }>
}

export function QuotationQuotaCard({
  refreshKey = 0,
  onUsageChange,
}: {
  refreshKey?: number
  onUsageChange?: (usage: QuotationQuotaUsage | null) => void
}) {
  const [data, setData] = React.useState<QuotaPayload | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState(false)
  const [buyOpen, setBuyOpen] = React.useState(false)
  const [buyingId, setBuyingId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/quotation-quota", { cache: "no-store" })
      if (!response.ok) throw new Error("No se pudo consultar el cupo")
      const payload = await response.json() as QuotaPayload
      setData(payload)
      setLoadError(false)
      onUsageChange?.(payload.usage)
    } catch (error) {
      console.error(error)
      setLoadError(true)
      onUsageChange?.(null)
    } finally {
      setLoading(false)
    }
  }, [onUsageChange])

  React.useEffect(() => { void load() }, [load, refreshKey])

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const orderId = params.get("orderId")
    const returned = params.get("quotationCredits")
    if (!orderId || !returned) return

    let cancelled = false
    const clearReturnParams = () => {
      const next = new URL(window.location.href)
      next.searchParams.delete("orderId")
      next.searchParams.delete("quotationCredits")
      window.history.replaceState({}, "", `${next.pathname}${next.search}${next.hash}`)
    }
    const check = async () => {
      for (let attempt = 0; attempt < 8 && !cancelled; attempt += 1) {
        const response = await fetch(`/api/billing/quotation-credits/orders/${orderId}`, { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        const status = payload?.order?.status
        if (status === "APPROVED") {
          toast.success("Créditos acreditados. El cupo ya está actualizado.")
          clearReturnParams()
          await load()
          return
        }
        if (["REJECTED", "CANCELLED", "FAILED", "REFUNDED", "CHARGEBACK"].includes(status)) {
          toast.error("La compra no se acreditó. Podés volver a intentarlo.")
          clearReturnParams()
          return
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500))
      }
      if (!cancelled) toast.info("El pago sigue pendiente. El cupo se actualizará al acreditarse.")
      clearReturnParams()
    }
    void check()
    return () => { cancelled = true }
  }, [load])

  async function buy(pack: QuotationCreditPackage) {
    setBuyingId(pack.id)
    try {
      const response = await fetch("/api/billing/quotation-credits/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ package_id: pack.id }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.checkout_url) {
        throw new Error(payload.error || "No se pudo iniciar la compra")
      }
      window.location.assign(payload.checkout_url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar la compra")
    } finally {
      setBuyingId(null)
    }
  }

  if (loading && !data) {
    return <Card className="h-52 animate-pulse border-border/60 bg-muted/20" />
  }
  if (!data && loadError) {
    return (
      <Card className="border-border/60 p-5">
        <p className="text-sm font-medium">No se pudo consultar el uso de cotizaciones.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Reintentar</Button>
      </Card>
    )
  }
  if (!data) return null

  const { usage } = data
  const percentage = usage.limit && usage.limit > 0
    ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
    : 0
  const nearingLimit = percentage >= 80
  const fmtDate = (value: string | null) => value
    ? new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
    : "—"

  return (
    <>
      <Card className={usage.at_limit && usage.enforcement_enabled
        ? "overflow-hidden border-destructive/35"
        : "overflow-hidden border-border/60"}
      >
        <div className={usage.at_limit && usage.enforcement_enabled
          ? "h-1 bg-destructive"
          : nearingLimit
            ? "h-1 bg-accent-coral"
            : "h-1 bg-primary"}
        />
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Cotizaciones creadas</CardTitle>
                {!usage.enforcement_enabled && (
                  <Badge variant="outline" className="font-normal">Solo seguimiento</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Cada PDF o nueva versión emitida cuenta. Las descargas y vistas previas no.
              </p>
            </div>
            {(nearingLimit || usage.at_limit) && (
              data.can_manage_billing ? (
                <Button size="sm" onClick={() => setBuyOpen(true)} disabled={data.packages.length === 0}>
                  <Plus className="mr-1.5 h-4 w-4" /> Comprar más
                </Button>
              ) : (
                <Badge variant="outline" className="w-fit border-accent-coral/40 text-accent-coral">
                  Contactá a un administrador
                </Badge>
              )
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
            <div className="rounded-xl border border-border/50 bg-muted/15 p-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-4xl font-semibold tracking-tight tabular-nums">
                    {usage.used}
                    {usage.limit !== null && (
                      <span className="ml-1 text-lg font-normal text-muted-foreground">/ {usage.limit}</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ciclo {fmtDate(usage.starts_at)} — {fmtDate(usage.ends_at)}
                  </p>
                </div>
                {usage.remaining !== null && (
                  <div className="text-right">
                    <p className="text-xl font-semibold tabular-nums">{usage.remaining}</p>
                    <p className="text-xs text-muted-foreground">disponibles</p>
                  </div>
                )}
              </div>
              {usage.limit !== null && <Progress value={percentage} className="mt-4 h-2" />}
              {usage.extra > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Incluye {usage.extra} crédito{usage.extra === 1 ? "" : "s"} adicional{usage.extra === 1 ? "" : "es"}.
                </p>
              )}
              {usage.at_limit && usage.enforcement_enabled && (
                <div className="mt-4 flex gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>No se pueden crear ni emitir nuevas cotizaciones hasta ampliar el cupo.</span>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border/50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Por agencia
              </p>
              <div className="space-y-3">
                {usage.agencies.map((agency) => (
                  <div key={agency.agency_id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{agency.agency_name}</span>
                    <span className="font-semibold tabular-nums">{agency.used}</span>
                  </div>
                ))}
                {usage.agencies.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin agencias visibles.</p>
                )}
              </div>
            </div>
          </div>

          {data.emissions.length > 0 && (
            <details className="group rounded-xl border border-border/50">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
                Ver emisiones contabilizadas
                <span className="ml-2 text-xs font-normal text-muted-foreground">últimas {data.emissions.length}</span>
              </summary>
              <div className="border-t border-border/50 px-4 py-2">
                {data.emissions.map((emission) => (
                  <div key={emission.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-border/40 py-2.5 text-xs last:border-0">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {emission.quotation_number} · versión {emission.sequence}
                      </p>
                      <p className="truncate text-muted-foreground">
                        {emission.agency_name} · {emission.generated_by_name}
                      </p>
                    </div>
                    <time className="text-muted-foreground">
                      {new Date(emission.created_at).toLocaleDateString("es-AR")}
                    </time>
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ampliar cupo de cotizaciones</DialogTitle>
            <DialogDescription>
              Los créditos se comparten entre todas las agencias y vencen el {fmtDate(usage.ends_at)}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.packages.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => void buy(pack)}
                disabled={buyingId !== null}
                className="rounded-xl border border-border/60 p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{pack.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">+{pack.units} cotizaciones</p>
                  </div>
                  {buyingId === pack.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4 text-primary" />}
                </div>
                <p className="mt-4 text-lg font-semibold">{formatArs(Number(pack.price_ars))}</p>
              </button>
            ))}
            {data.packages.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                Todavía no hay paquetes disponibles. Contactá a soporte.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
