"use client"

import * as React from "react"
import {
  AlertTriangle,
  Blocks,
  Bot,
  Brain,
  Calculator,
  Check,
  GraduationCap,
  Loader2,
  MessagesSquare,
  Smartphone,
  Users,
  Wand2,
} from "lucide-react"
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
import { formatArs } from "@/lib/billing/plans"

/**
 * Vitrina de complementos del tenant.
 *
 * Dos tratamientos distintos a propósito, para que la pantalla no sea una grilla
 * uniforme de tarjetas: lo que la agencia YA tiene va como lista densa arriba
 * (es administración, se consulta rápido), y lo que puede sumar va como fichas
 * con lo que hace cada uno (es decisión, necesita argumento).
 *
 * El precio nunca se esconde y la confirmación siempre dice cómo queda la
 * factura y desde cuándo. Una tienda adentro de una herramienta de trabajo tiene
 * que vender sin sorprender: el reclamo del mes siguiente cuesta más caro que la
 * venta.
 */

interface Addon {
  key: string
  name: string
  description: string
  highlights: string[]
  category: "integraciones" | "ia" | "modulos"
  selfServe: boolean
  setupNote: string | null
  state: string
  includedInPlan: boolean
  includedUntil: string | null
  /** Lo que se le cobra a esta org. Solo tiene valor si lo tiene contratado. */
  priceArsMonthly: number
  /** Precio de lista. null = todavía sin precio publicado. */
  listPriceArsMonthly: number | null
  cancelEffectiveAt: string | null
  availableInCatalog: boolean
}

interface Payload {
  addons: Addon[]
  totals: { nowArs: number; nextCycleArs: number }
  nextChargeAt: string | null
  mpSyncState: string
}

/** Estados en los que el complemento es de la agencia y no se le ofrece de nuevo. */
const PROPIOS = new Set([
  "ACTIVE",
  "SCHEDULED_CANCEL",
  "INCLUDED",
  "REQUESTED",
  "PENDING_SETUP",
])

const ICONOS: Record<string, React.ComponentType<{ className?: string }>> = {
  agente_blanco: MessagesSquare,
  emilia: Bot,
  growth_studio: Wand2,
  wha_control: Smartphone,
  library: GraduationCap,
  referrals: Users,
  monthly_commissions: Calculator,
  cerebro: Brain,
}

const CATEGORIAS: { id: Addon["category"]; label: string }[] = [
  { id: "integraciones", label: "Integraciones" },
  { id: "ia", label: "Inteligencia artificial" },
  { id: "modulos", label: "Módulos" },
]

function fecha(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "long" })
}

/**
 * Lo que se le cobra por algo que ya tiene. Para lo incluido en el plan dice
 * "sin cargo" y no repite "incluido en tu plan": eso ya lo dice el badge de al
 * lado, y la línea de abajo es la que responde cuánto sale.
 */
function precioPropio(addon: Addon): string {
  if (addon.includedInPlan || addon.priceArsMonthly === 0) return "Sin cargo"
  return `${formatArs(addon.priceArsMonthly)} por mes`
}

/**
 * Un complemento se puede activar de una sola vez cuando es self-serve Y tiene
 * precio publicado. Sin precio no se activa solo: se solicita, y lo damos de
 * alta nosotros con el importe confirmado. Nadie contrata a ciegas.
 */
function esActivableSolo(addon: Addon): boolean {
  return addon.selfServe && addon.listPriceArsMonthly !== null
}

type Confirmacion = { addon: Addon; accion: "enable" | "schedule_cancel" } | null

export function AddonsStore() {
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
          description: addon.listPriceArsMonthly
            ? "Te escribimos cuando esté listo."
            : "Te pasamos el precio antes de activarlo.",
        })
      } else if (action === "enable") {
        toast.success(`${addon.name} ya está disponible`, {
          description:
            json.syncOutcome?.kind === "DEFERRED"
              ? "Nos contactamos para confirmar el nuevo importe."
              : undefined,
        })
      } else if (action === "schedule_cancel") {
        toast.success("Baja programada", {
          description: "Lo seguís usando hasta el fin del período.",
        })
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
      <div className="rounded-xl border border-border/60 p-10 text-center">
        <p className="text-sm text-muted-foreground">No pudimos cargar los complementos.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (!data) return <Cargando />

  const propios = data.addons.filter((a) => PROPIOS.has(a.state))
  const enVenta = data.addons.filter((a) => !PROPIOS.has(a.state) && a.availableInCatalog)
  const cambia = data.totals.nextCycleArs !== data.totals.nowArs

  if (propios.length === 0 && enVenta.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 p-10 text-center">
        <p className="text-sm font-medium">Todavía no hay complementos disponibles</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Cuando publiquemos alguno, vas a poder activarlo desde acá y verlo en tu próxima factura.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {data.mpSyncState === "PENDING_REAUTH" && (
        <div className="flex gap-3 rounded-lg border border-border bg-accent/40 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            El cambio de importe necesita que lo confirmes con Mercado Pago. Tu cuenta sigue activa y
            nos vamos a comunicar para cerrarlo.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Tu suscripción hoy:{" "}
          <span className="font-semibold text-foreground">{formatArs(data.totals.nowArs)}</span> por
          mes
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

      {propios.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Los que ya tenés</h2>
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
            {propios.map((addon) => (
              <FilaPropia
                key={addon.key}
                addon={addon}
                busy={busy === addon.key}
                onPedirConfirmacion={setConfirmar}
                onEjecutar={ejecutar}
              />
            ))}
          </div>
        </section>
      )}

      {enVenta.length > 0 && (
        <section className="space-y-8">
          <h2 className="text-sm font-semibold">Para sumar a tu cuenta</h2>
          {CATEGORIAS.map(({ id, label }) => {
            const items = enVenta.filter((a) => a.category === id)
            if (items.length === 0) return null
            return (
              <div key={id} className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {items.map((addon) => (
                    <FichaTienda
                      key={addon.key}
                      addon={addon}
                      busy={busy === addon.key}
                      onPedirConfirmacion={setConfirmar}
                      onEjecutar={ejecutar}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      )}

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
                      {formatArs(data.totals.nextCycleArs)} a{" "}
                      {formatArs(
                        data.totals.nextCycleArs + (confirmar.addon.listPriceArsMonthly ?? 0)
                      )}{" "}
                      por mes a partir del {fecha(data.nextChargeAt)}, tu próximo cobro. Hasta esa
                      fecha no se cobra nada extra.
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

function Icono({ addonKey, className }: { addonKey: string; className?: string }) {
  const Componente = ICONOS[addonKey] ?? Blocks
  return <Componente className={className} />
}

/** Fila de administración: lo que ya tiene la agencia. */
function FilaPropia({
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
        aria-hidden
      >
        <Icono addonKey={addon.key} className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
        <p className="mt-0.5 text-sm text-muted-foreground">
          {pendiente && addon.setupNote ? addon.setupNote : precioPropio(addon)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
        {addon.includedInPlan ? null : pendiente ? (
          <Button
            variant="ghost"
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
        ) : activo ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onPedirConfirmacion({ addon, accion: "schedule_cancel" })}
          >
            Dar de baja
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Ficha de vitrina: lo que la agencia todavía no tiene. */
function FichaTienda({
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
  const activableSolo = esActivableSolo(addon)

  return (
    <article className="flex flex-col rounded-xl border border-border/60 bg-card p-5 transition-colors duration-200 hover:border-primary/40 motion-reduce:transition-none">
      <div className="flex items-start gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
          aria-hidden
        >
          <Icono addonKey={addon.key} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">{addon.name}</h4>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{addon.description}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {addon.highlights.map((h) => (
          <li key={h} className="flex gap-2 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span>{h}</span>
          </li>
        ))}
      </ul>

      {!addon.selfServe && addon.setupNote && (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{addon.setupNote}</p>
      )}

      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <div>
          <p className="text-sm font-semibold">
            {addon.listPriceArsMonthly !== null
              ? formatArs(addon.listPriceArsMonthly)
              : "A consultar"}
          </p>
          {addon.listPriceArsMonthly !== null && (
            <p className="text-xs text-muted-foreground">por mes</p>
          )}
        </div>
        <Button
          size="sm"
          disabled={busy}
          aria-busy={busy}
          onClick={() =>
            activableSolo
              ? onPedirConfirmacion({ addon, accion: "enable" })
              : void onEjecutar(addon, "request")
          }
        >
          {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
          {activableSolo ? "Activar" : "Solicitar"}
        </Button>
      </div>
    </article>
  )
}

function Cargando() {
  return (
    <div className="space-y-8" aria-busy="true">
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    </div>
  )
}
