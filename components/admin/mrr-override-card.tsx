"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed === "") return submit(null)
    const num = Number(trimmed)
    if (!Number.isFinite(num) || num < 0) {
      setError("Ingresá un número válido (>= 0) o dejá vacío para borrar.")
      return
    }
    submit(num)
  }

  function handleClear() {
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
          <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
            ⚠️ Esta org tiene un custom plan registrado. El override tiene prioridad sobre el custom plan en el cálculo del MRR. Usar solo si necesitás saltear el custom plan deliberadamente.
          </div>
        )}
        <form onSubmit={handleSave} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="mrr-override" className="text-xs text-slate-400">
              Monto en ARS por mes
            </Label>
            <Input
              id="mrr-override"
              type="number"
              min={0}
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
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
          <p className="mt-3 text-xs text-slate-500">
            Override actual: <span className="text-slate-300 font-medium">{formatArs(Number(currentOverride))}</span>
          </p>
        )}
        {error && (
          <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
