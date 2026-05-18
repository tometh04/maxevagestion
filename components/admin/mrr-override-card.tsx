"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DecimalInput } from "@/components/ui/decimal-input"
import { Label } from "@/components/ui/label"
import { formatArs } from "@/lib/billing/plans"

type Props = {
  orgId: string
  currentOverride: number | null
  hasCustomPlan: boolean
}

export function MrrOverrideCard({ orgId, currentOverride, hasCustomPlan }: Props) {
  const router = useRouter()
  const [value, setValue] = React.useState(
    currentOverride != null ? String(currentOverride) : "",
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(amount: number | null) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/mrr-override`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setSaving(false)
    }
  }

  // Bug #8: cap razonable para evitar typos (un MRR > $100M ARS es casi seguro
  // un copy/paste con cero de más). El backend igual valida.
  const MRR_MAX_ARS = 100_000_000

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    // Si el input está vacío y ya hay override, exigir el botón "Borrar override"
    // (que pide confirm) — no se permite borrar accidentalmente con Enter.
    if (trimmed === "") {
      if (currentOverride != null) {
        setError(
          'Para borrar el override usá el botón "Borrar override". El input vacío en "Guardar" no borra.',
        )
        return
      }
      // Si no hay override existente, no-op
      return
    }
    const num = Number(trimmed)
    if (!Number.isFinite(num) || num < 0) {
      setError("Ingresá un número válido (>= 0) o usá 'Borrar override'.")
      return
    }
    if (num > MRR_MAX_ARS) {
      setError(
        `El monto $${num.toLocaleString("es-AR")} parece muy alto (máx $${MRR_MAX_ARS.toLocaleString("es-AR")}). Verificá el valor.`,
      )
      return
    }
    submit(num)
  }

  function handleClear() {
    if (currentOverride != null) {
      const ok = window.confirm(
        `¿Borrar el override de MRR ($${Number(currentOverride).toLocaleString("es-AR")})? Esta org volverá a calcular MRR desde su custom plan o el plan estándar.`,
      )
      if (!ok) return
    }
    setValue("")
    submit(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">MRR mensual (override)</CardTitle>
        <CardDescription>
          Para deals fuera del flow MP/custom_plan (transferencia, factura manual). Tiene prioridad sobre custom_plan y PLANS price.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasCustomPlan && (
          <div className="mb-4 rounded border border-accent-coral/40 bg-accent-coral/10 p-3 text-xs text-accent-coral">
            ⚠️ Esta org tiene un custom plan registrado. El override tiene prioridad sobre el custom plan en el cálculo del MRR. Usar solo si necesitás saltear el custom plan deliberadamente.
          </div>
        )}
        <form onSubmit={handleSave} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="mrr-override" className="text-xs text-muted-foreground">
              Monto en ARS por mes
            </Label>
            <DecimalInput
              id="mrr-override"
              value={value}
              onChange={(v) => setValue(v)}
              placeholder="Ej: 719000"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
            {currentOverride != null && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleClear}
                disabled={saving}
              >
                Borrar override
              </Button>
            )}
          </div>
        </form>
        {currentOverride != null && (
          <p className="mt-3 text-xs text-muted-foreground">
            Override actual: <span className="text-muted-foreground font-medium">{formatArs(Number(currentOverride))}</span>
          </p>
        )}
        {error && (
          <div className="mt-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
