"use client"

import * as React from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatArs } from "@/lib/billing/plans"

interface OrgAddon {
  key: string
  name: string
  state: string
  enabled: boolean
  selfServe: boolean
  requiresOrgSlug: boolean
  includedInPlan: boolean
  includedUntil: string | null
  priceArsMonthly: number
  cancelEffectiveAt: string | null
  availableInCatalog: boolean
}

interface Payload {
  addons: OrgAddon[]
  totals: {
    now: { baseArs: number; addonsArs: number; totalArs: number; addonsSuppressedByOverride: boolean }
    next: { totalArs: number }
  }
  mpSyncState: string
  billsManually: boolean
  hasAgenteBlancoSlug: boolean
}

const ESTADO: Record<string, string> = {
  ACTIVE: "Contratado",
  SCHEDULED_CANCEL: "Se da de baja",
  REQUESTED: "Solicitado",
  PENDING_SETUP: "En preparación",
  CANCELLED: "Dado de baja",
  DENIED: "Rechazado",
  INCLUDED: "Incluido en el plan",
  OFF: "Sin contratar",
}

function fecha(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function OrgAddonsCard({ orgId }: { orgId: string }) {
  const [data, setData] = React.useState<Payload | null>(null)
  const [error, setError] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setError(false)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/addons`, { cache: "no-store" })
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError(true)
    }
  }, [orgId])

  React.useEffect(() => {
    void load()
  }, [load])

  async function accionar(addonKey: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(addonKey)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/addons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, addon_key: addonKey, ...extra }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || "No se pudo aplicar el cambio")
        return
      }
      const outcome = json.syncOutcome
      if (outcome?.kind === "REAUTH_PENDING") {
        toast.warning("El cliente tiene que volver a autorizar el importe en Mercado Pago", {
          description: "La cuenta NO quedó suspendida. Pasale el link de autorización.",
        })
      } else if (outcome?.kind === "DEFERRED") {
        toast.warning("El aumento supera el 20% que Mercado Pago ajusta solo", {
          description: "Quedó pendiente de re-autorización.",
        })
      } else if (outcome?.kind === "NO_MP") {
        toast.success("Listo. Esta cuenta se factura a mano: cobrá el nuevo importe.")
      } else {
        toast.success("Listo")
      }
      await load()
    } catch {
      toast.error("No se pudo aplicar el cambio")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Complementos</CardTitle>
        <CardDescription>
          Adicionales contratados por esta agencia. Los cambios entran en la facturación del próximo
          ciclo, sin prorrateo.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {data === null ? (
          error ? (
            <div className="rounded-xl border border-border/50 p-6 text-center">
              <p className="text-sm text-muted-foreground">No pudimos cargar los complementos.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
                Reintentar
              </Button>
            </div>
          ) : (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          )
        ) : (
          <>
            <div className="rounded-xl border border-border/50 p-4">
              <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                <div>
                  <dt className="inline text-muted-foreground">Plan </dt>
                  <dd className="inline font-medium">{formatArs(data.totals.now.baseArs)}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Complementos </dt>
                  <dd className="inline font-medium">{formatArs(data.totals.now.addonsArs)}</dd>
                </div>
                <div>
                  <dt className="inline text-muted-foreground">Total hoy </dt>
                  <dd className="inline text-base font-semibold">
                    {formatArs(data.totals.now.totalArs)}
                  </dd>
                </div>
                {data.totals.next.totalArs !== data.totals.now.totalArs && (
                  <div>
                    <dt className="inline text-muted-foreground">Próximo ciclo </dt>
                    <dd className="inline font-semibold">{formatArs(data.totals.next.totalArs)}</dd>
                  </div>
                )}
              </dl>

              {data.totals.now.addonsSuppressedByOverride && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Esta cuenta tiene un importe fijado a mano, así que los complementos no se le suman.
                  Para cobrarlos, ajustá ese importe.
                </p>
              )}
              {data.billsManually && (
                <p className="mt-2 text-xs text-muted-foreground">
                  No cobra por Mercado Pago: el nuevo importe hay que facturarlo a mano.
                </p>
              )}
            </div>

            {data.mpSyncState === "PENDING_REAUTH" && (
              <div className="flex gap-3 rounded-lg border border-border bg-accent/40 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  El importe nuevo todavía no se aplicó en Mercado Pago: supera el 20% que se puede
                  ajustar sin que el cliente vuelva a autorizar. La cuenta sigue activa.
                </p>
              </div>
            )}

            <div className="divide-y divide-border/50 rounded-xl border border-border/50">
              {data.addons.map((addon) => (
                <Fila
                  key={addon.key}
                  addon={addon}
                  busy={busy === addon.key}
                  hasSlug={data.hasAgenteBlancoSlug}
                  onAction={accionar}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Fila({
  addon,
  busy,
  hasSlug,
  onAction,
}: {
  addon: OrgAddon
  busy: boolean
  hasSlug: boolean
  onAction: (key: string, action: string, extra?: Record<string, unknown>) => Promise<void>
}) {
  const [precio, setPrecio] = React.useState("")
  const activo = addon.state === "ACTIVE" || addon.state === "SCHEDULED_CANCEL"
  const pendiente = addon.state === "REQUESTED" || addon.state === "PENDING_SETUP"
  const bloqueadoPorSlug = addon.requiresOrgSlug && !hasSlug

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{addon.name}</p>
          <Badge variant={activo || addon.includedInPlan ? "default" : "outline"} className="font-normal">
            {ESTADO[addon.state] ?? addon.state}
          </Badge>
          {pendiente && <Badge variant="outline" className="font-normal">Requiere acción</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {addon.includedInPlan
            ? `Sin cargo${addon.includedUntil ? ` hasta el ${fecha(addon.includedUntil)}` : " por su plan"}`
            : activo
              ? formatArs(addon.priceArsMonthly) + "/mes"
              : "Sin cargo"}
          {addon.state === "SCHEDULED_CANCEL" &&
            addon.cancelEffectiveAt &&
            ` · se apaga el ${fecha(addon.cancelEffectiveAt)}`}
          {bloqueadoPorSlug && " · falta cargar el identificador de la empresa"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}

        {activo && (
          <>
            <Input
              type="number"
              min="0"
              inputMode="numeric"
              className="h-9 w-28"
              placeholder="Precio"
              aria-label={`Precio de ${addon.name}`}
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || precio.trim() === ""}
              onClick={() => onAction(addon.key, "set_price", { price_ars_monthly: Number(precio) })}
            >
              Fijar precio
            </Button>
          </>
        )}

        {addon.state === "ACTIVE" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onAction(addon.key, "cancel_scheduled")}
          >
            Programar baja
          </Button>
        )}

        {pendiente && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onAction(addon.key, "deny", { note: "Rechazado desde platform admin" })}
          >
            Rechazar
          </Button>
        )}

        {!activo && (
          <Button
            size="sm"
            disabled={busy || bloqueadoPorSlug}
            title={bloqueadoPorSlug ? "Cargá primero el identificador de la empresa" : undefined}
            onClick={() => onAction(addon.key, "activate")}
          >
            Activar
          </Button>
        )}
      </div>
    </div>
  )
}
