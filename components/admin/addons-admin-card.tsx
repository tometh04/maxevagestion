"use client"

import * as React from "react"
import { AlertTriangle, ChevronRight, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { formatArs } from "@/lib/billing/plans"

interface AddonOrg {
  orgId: string
  name: string
  plan: string | null
  subscriptionStatus: string | null
  status: string
  priceArsMonthly: number | null
  since: string | null
  cancelEffectiveAt: string | null
}

interface AddonRow {
  key: string
  name: string
  description: string
  category: string
  selfServe: boolean
  requiresSetup: boolean
  priceArsMonthly: number | null
  active: boolean
  enforcement: "OFF" | "SHADOW" | "ON"
  orgsActive: number
  orgsPending: number
  orgs: AddonOrg[]
  inclusions: { planId: string; includedUntil: string | null }[]
}

const ESTADO_ORG: Record<string, string> = {
  ACTIVE: "Activo",
  SCHEDULED_CANCEL: "Baja programada",
  REQUESTED: "Solicitado",
  PENDING_SETUP: "En preparación",
}

const ENFORCEMENT_META: Record<string, { label: string; hint: string; className: string }> = {
  OFF: {
    label: "Sin aplicar",
    hint: "Todos lo siguen viendo. El complemento no corta el acceso a nadie.",
    className: "bg-muted text-muted-foreground",
  },
  SHADOW: {
    label: "En prueba",
    hint: "Nadie pierde el acceso, pero queda registrado a quién cortaría al aplicarlo.",
    className: "bg-accent text-accent-foreground",
  },
  ON: {
    label: "Aplicando",
    hint: "Solo entran las agencias que lo tienen contratado o incluido en su plan.",
    className: "bg-primary text-primary-foreground",
  },
}

const ORDEN: ("OFF" | "SHADOW" | "ON")[] = ["OFF", "SHADOW", "ON"]

/** ¿Vence la inclusión dentro de los próximos 30 días? */
function venceEnBreve(iso: string | null): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  const treintaDias = 30 * 24 * 60 * 60 * 1000
  return t > Date.now() && t - Date.now() < treintaDias
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function AddonsAdminCard() {
  const [addons, setAddons] = React.useState<AddonRow[] | null>(null)
  const [error, setError] = React.useState(false)

  const load = React.useCallback(async () => {
    setError(false)
    try {
      const res = await fetch("/api/admin/billing/addons", { cache: "no-store" })
      if (!res.ok) throw new Error()
      const json = await res.json()
      setAddons(json.addons)
    } catch {
      setError(true)
      setAddons([])
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const porVencer = (addons ?? []).flatMap((a) =>
    a.inclusions
      .filter((i) => venceEnBreve(i.includedUntil))
      .map((i) => ({ addon: a.name, plan: i.planId, hasta: i.includedUntil as string }))
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Complementos</CardTitle>
        <CardDescription>
          Precio y disponibilidad de cada adicional. Cambiar el precio no re-cobra a quien ya lo
          tiene: conserva el suyo y el nuevo aplica a las altas siguientes.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {porVencer.length > 0 && (
          <div className="flex gap-3 rounded-lg border border-border bg-accent/40 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">Inclusiones que vencen pronto</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {porVencer.map((v) => (
                  <li key={`${v.addon}-${v.plan}`}>
                    {v.addon} deja de estar incluido en {v.plan} el {fecha(v.hasta)}. Al vencer se
                    apaga sin cobrarse: hay que avisar antes.
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {addons === null ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-border/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">No pudimos cargar el catálogo.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/50 rounded-xl border border-border/50">
            {addons.map((addon) => (
              <AddonCatalogRow key={addon.key} addon={addon} onSaved={load} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AddonCatalogRow({ addon, onSaved }: { addon: AddonRow; onSaved: () => Promise<void> }) {
  const [price, setPrice] = React.useState(
    addon.priceArsMonthly !== null ? String(addon.priceArsMonthly) : ""
  )
  const [active, setActive] = React.useState(addon.active)
  const [enforcement, setEnforcement] = React.useState(addon.enforcement)
  const [saving, setSaving] = React.useState(false)
  const [verOrgs, setVerOrgs] = React.useState(false)

  React.useEffect(() => {
    setPrice(addon.priceArsMonthly !== null ? String(addon.priceArsMonthly) : "")
    setActive(addon.active)
    setEnforcement(addon.enforcement)
  }, [addon])

  const dirty =
    active !== addon.active ||
    enforcement !== addon.enforcement ||
    price !== (addon.priceArsMonthly !== null ? String(addon.priceArsMonthly) : "")

  async function guardar() {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/billing/addons", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "addon",
          addon_key: addon.key,
          price_ars_monthly: price.trim() === "" ? null : Number(price),
          active,
          enforcement,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${addon.name} actualizado`)
      await onSaved()
    } catch {
      toast.error(`No se pudo actualizar ${addon.name}`)
    } finally {
      setSaving(false)
    }
  }

  const meta = ENFORCEMENT_META[enforcement]

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{addon.name}</p>
          <Badge variant="outline" className="font-normal capitalize">
            {addon.category}
          </Badge>
          {addon.requiresSetup && (
            <Badge variant="outline" className="font-normal">
              Requiere configuración nuestra
            </Badge>
          )}
        </div>
        <p className="mt-1 max-w-prose text-xs text-muted-foreground">{addon.description}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {addon.orgs.length > 0 ? (
            <button
              type="button"
              onClick={() => setVerOrgs((v) => !v)}
              aria-expanded={verOrgs}
              className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              <ChevronRight
                className={`h-3 w-3 transition-transform duration-150 motion-reduce:transition-none ${verOrgs ? "rotate-90" : ""}`}
                aria-hidden
              />
              {addon.orgsActive}{" "}
              {addon.orgsActive === 1 ? "agencia lo tiene" : "agencias lo tienen"}
            </button>
          ) : (
            <span>Ninguna agencia lo tiene</span>
          )}
          {addon.orgsPending > 0 && ` · ${addon.orgsPending} pendiente${addon.orgsPending === 1 ? "" : "s"}`}
          {addon.inclusions.length > 0 &&
            ` · incluido en ${addon.inclusions.map((i) => i.planId).join(", ")}`}
        </p>

        {/* Desglose por agencia: el control interno es "quién tiene qué", no
            "cuántos". Colapsado por defecto para no romper la lectura vertical
            de la lista de complementos. */}
        {verOrgs && addon.orgs.length > 0 && (
          <ul className="mt-2 divide-y divide-border/50 rounded-lg border border-border/50">
            {addon.orgs.map((org) => (
              <li
                key={org.orgId}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-1.5 text-xs"
              >
                <span className="min-w-0 font-medium">
                  {org.name}
                  {org.subscriptionStatus && org.subscriptionStatus !== "ACTIVE" && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({org.subscriptionStatus.toLowerCase()})
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground">
                  {ESTADO_ORG[org.status] ?? org.status}
                  {org.status === "SCHEDULED_CANCEL" && org.cancelEffectiveAt
                    ? ` hasta el ${fecha(org.cancelEffectiveAt)}`
                    : ""}
                  {" · "}
                  {org.priceArsMonthly && org.priceArsMonthly > 0
                    ? formatArs(org.priceArsMonthly)
                    : "sin cargo"}
                  {org.since ? ` · desde el ${fecha(org.since)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32 space-y-1.5">
          <Label htmlFor={`precio-${addon.key}`} className="text-xs">
            Precio ARS/mes
          </Label>
          <Input
            id={`precio-${addon.key}`}
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="Sin precio"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>

        <div className="w-40 space-y-1.5">
          <Label htmlFor={`aplicar-${addon.key}`} className="text-xs">
            Aplicación
          </Label>
          <select
            id={`aplicar-${addon.key}`}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={enforcement}
            onChange={(e) => setEnforcement(e.target.value as AddonRow["enforcement"])}
          >
            {ORDEN.map((v) => (
              <option key={v} value={v}>
                {ENFORCEMENT_META[v].label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`ofrecer-${addon.key}`} className="text-xs">
            Se ofrece
          </Label>
          <div className="flex h-10 items-center">
            <Switch id={`ofrecer-${addon.key}`} checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <Button size="sm" disabled={!dirty || saving} onClick={() => void guardar()}>
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              Guardando
            </>
          ) : (
            "Guardar"
          )}
        </Button>

        <p className="w-full text-xs text-muted-foreground lg:max-w-[22rem]">
          <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.className}`}>
            {meta.label}
          </span>
          {meta.hint}
          {price.trim() === "" && active && " Sin precio cargado se ofrece sin cargo."}
        </p>
      </div>
    </div>
  )
}
