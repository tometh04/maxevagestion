"use client"

import * as React from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { formatArs } from "@/lib/billing/plans"

interface Addon {
  key: string
  name: string
  description: string
  category: string
  selfServe: boolean
  setupNote: string | null
  state: string
  includedInPlan: boolean
  includedUntil: string | null
  priceArsMonthly: number
  cancelEffectiveAt: string | null
}

interface Payload {
  addons: Addon[]
  totals: { nowArs: number; nextCycleArs: number }
  nextChargeAt: string | null
  mpSyncState: string
}

function fecha(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "long" })
}

type Confirmacion = { addon: Addon; accion: "enable" | "schedule_cancel" } | null

export function AddonsManager() {
  const [data, setData] = React.useState<Payload | null>(null)
  const [error, setError] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirmar, setConfirmar] = React.useState<Confirmacion>(null)

  const load = React.useCallback(async () => {
    setError(false)
    try {
      const res = await fetch("/api/billing/addons", { cache: "no-store" })
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError(true)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  async function ejecutar(addon: Addon, action: string) {
    setBusy(addon.key)
    setConfirmar(null)
    try {
      const res = await fetch("/api/billing/addons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addon_key: addon.key, action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || "No pudimos aplicar el cambio")
        return
      }
      if (action === "request") {
        toast.success(`Pedimos la activación de ${addon.name}`, {
          description: "Te escribimos cuando esté listo.",
        })
      } else if (action === "enable") {
        toast.success(`${addon.name} ya está disponible`, {
          description:
            json.syncOutcome?.kind === "DEFERRED"
              ? "Nos contactamos para confirmar el nuevo importe."
              : undefined,
        })
      } else if (action === "schedule_cancel") {
        toast.success("Baja programada", { description: "Lo seguís usando hasta el fin del período." })
      } else {
        toast.success("Listo")
      }
      await load()
    } catch {
      toast.error("No pudimos aplicar el cambio")
    } finally {
      setBusy(null)
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">No pudimos cargar los complementos.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    )
  }

  if (data.addons.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 p-8 text-center">
        <p className="text-sm font-medium">Todavía no hay complementos disponibles</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuando publiquemos alguno, vas a poder activarlo desde acá.
        </p>
      </div>
    )
  }

  const cambia = data.totals.nextCycleArs !== data.totals.nowArs

  return (
    <div className="space-y-4">
      {data.mpSyncState === "PENDING_REAUTH" && (
        <div className="flex gap-3 rounded-lg border border-border bg-accent/40 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            El cambio de importe necesita que lo confirmes con Mercado Pago. Tu cuenta sigue activa y
            nos vamos a comunicar para cerrarlo.
          </p>
        </div>
      )}

      <div className="divide-y divide-border/50 rounded-xl border border-border/50">
        {data.addons.map((addon) => (
          <Fila
            key={addon.key}
            addon={addon}
            busy={busy === addon.key}
            onPedirConfirmacion={setConfirmar}
            onEjecutar={ejecutar}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 rounded-xl border border-border/50 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Hoy pagás{" "}
          <span className="font-semibold text-foreground">{formatArs(data.totals.nowArs)}</span> por mes
        </p>
        {cambia && (
          <p className="text-sm text-muted-foreground">
            Desde el {fecha(data.nextChargeAt)}:{" "}
            <span className="font-semibold text-foreground">
              {formatArs(data.totals.nextCycleArs)}
            </span>{" "}
            por mes
          </p>
        )}
      </div>

      <AlertDialog open={confirmar !== null} onOpenChange={(open) => !open && setConfirmar(null)}>
        <AlertDialogContent>
          {confirmar && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmar.accion === "enable"
                    ? `Activar ${confirmar.addon.name}`
                    : `Dar de baja ${confirmar.addon.name}`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmar.accion === "enable" ? (
                    <>
                      Lo vas a poder usar ya mismo. Tu factura pasa de{" "}
                      {formatArs(data.totals.nowArs)} a{" "}
                      {formatArs(data.totals.nowArs + confirmar.addon.priceArsMonthly)} por mes a
                      partir del {fecha(data.nextChargeAt)}, tu próximo cobro. Hasta esa fecha no se
                      cobra nada extra.
                    </>
                  ) : (
                    <>
                      Lo seguís usando hasta el {fecha(data.nextChargeAt)}, que es el final del
                      período que ya pagaste, y después dejamos de cobrarlo. Tus datos no se borran:
                      si lo volvés a activar, está todo como lo dejaste.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void ejecutar(confirmar.addon, confirmar.accion)}>
                  {confirmar.accion === "enable" ? "Activar" : "Dar de baja"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Fila({
  addon,
  busy,
  onPedirConfirmacion,
  onEjecutar,
}: {
  addon: Addon
  busy: boolean
  onPedirConfirmacion: (c: Confirmacion) => void
  onEjecutar: (addon: Addon, action: string) => Promise<void>
}) {
  const pendiente = addon.state === "REQUESTED" || addon.state === "PENDING_SETUP"
  const enBaja = addon.state === "SCHEDULED_CANCEL"
  const activo = addon.state === "ACTIVE"

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="min-w-0 max-w-prose">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{addon.name}</p>
          {addon.includedInPlan && (
            <Badge variant="secondary" className="font-normal">
              Incluido en tu plan
              {addon.includedUntil ? ` hasta el ${fecha(addon.includedUntil)}` : ""}
            </Badge>
          )}
          {pendiente && (
            <Badge variant="outline" className="font-normal">
              En preparación
            </Badge>
          )}
          {enBaja && (
            <Badge variant="outline" className="font-normal">
              Se da de baja el {fecha(addon.cancelEffectiveAt)}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{addon.description}</p>
        {pendiente && addon.setupNote && (
          <p className="mt-1 text-xs text-muted-foreground">{addon.setupNote}</p>
        )}
        {!addon.includedInPlan && (
          <p className="mt-1 text-xs text-muted-foreground">
            {addon.priceArsMonthly > 0 ? `${formatArs(addon.priceArsMonthly)} por mes` : "Sin cargo"}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}

        {addon.includedInPlan ? null : pendiente ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void onEjecutar(addon, "cancel_request")}
          >
            Cancelar solicitud
          </Button>
        ) : enBaja ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void onEjecutar(addon, "undo_cancel")}
          >
            Reactivar
          </Button>
        ) : addon.selfServe ? (
          <Switch
            checked={activo}
            disabled={busy}
            aria-label={activo ? `Dar de baja ${addon.name}` : `Activar ${addon.name}`}
            onCheckedChange={() =>
              onPedirConfirmacion({ addon, accion: activo ? "schedule_cancel" : "enable" })
            }
          />
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void onEjecutar(addon, "request")}>
            Solicitar
          </Button>
        )}
      </div>
    </div>
  )
}
