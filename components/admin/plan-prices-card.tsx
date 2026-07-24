"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { formatArs } from "@/lib/billing/plans"

type PlanId = "STARTER" | "PRO" | "ENTERPRISE"

type Props = {
  /** Catálogo efectivo actual (overlay DB sobre constante). */
  prices: Record<PlanId, number | null>
}

// Cap defensivo contra typos (un plan > $10M ARS/mes es casi seguro un cero de más).
const PRICE_MAX_ARS = 10_000_000

// Solo PRO es editable: es el único plan estándar que se ofrece y cobra
// self-serve. STARTER es legacy (no se usa en la web) y ENTERPRISE se cobra
// per-cuenta con un precio custom.
const EDITABLE: { id: PlanId; label: string }[] = [
  { id: "PRO", label: "PRO" },
]

export function PlanPricesCard({ prices }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Precio del plan PRO</CardTitle>
        <CardDescription>
          Precio mensual del plan PRO (ARS). Cambiarlo afecta{" "}
          <strong>nuevos checkouts y cambios de plan</strong>; no re-cobra a las suscripciones
          ya activas (para eso, editá el precio de la cuenta puntual). Enterprise se cobra
          per-cuenta con un precio custom.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {EDITABLE.map((p) => (
          <PlanPriceRow key={p.id} planId={p.id} label={p.label} current={prices[p.id]} />
        ))}
      </CardContent>
    </Card>
  )
}

function PlanPriceRow({
  planId,
  label,
  current,
}: {
  planId: PlanId
  label: string
  current: number | null
}) {
  const router = useRouter()
  const [value, setValue] = React.useState(current != null ? String(current) : "")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [savedAt, setSavedAt] = React.useState<number | null>(null)

  const dirty = value.trim() !== (current != null ? String(current) : "")

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = value.trim()
    const num = Number(trimmed)
    if (!Number.isFinite(num) || num <= 0) {
      setError("Ingresá un monto válido (> 0).")
      return
    }
    if (num > PRICE_MAX_ARS) {
      setError(`El monto $${num.toLocaleString("es-AR")} parece muy alto. Verificá el valor.`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/billing/plan-prices", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan_id: planId, price_ars_monthly: num }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setSavedAt(Date.now())
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor={`plan-price-${planId}`} className="text-xs text-muted-foreground">
          {label} — ARS/mes{" "}
          {current != null && (
            <span className="text-muted-foreground/70">(actual: {formatArs(current)})</span>
          )}
        </Label>
        <DecimalInput
          id={`plan-price-${planId}`}
          value={value}
          onChange={(v) => setValue(v)}
          placeholder="Ej: 119000"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving || !dirty}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
        {savedAt && !dirty && <span className="text-xs text-success">Guardado ✓</span>}
      </div>
      {error && (
        <div className="w-full rounded border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive sm:w-auto">
          {error}
        </div>
      )}
    </form>
  )
}
