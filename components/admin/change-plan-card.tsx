"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type Props = {
  orgId: string
  currentPlan: string | null
  hasCustomPlan: boolean
  hasPreapproval: boolean
}

const TARGETS = [
  { id: "PRO", label: "PRO" },
  { id: "ENTERPRISE", label: "Enterprise" },
] as const

export function ChangePlanCard({ orgId, currentPlan, hasCustomPlan, hasPreapproval }: Props) {
  const router = useRouter()
  const [saving, setSaving] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [reauthUrl, setReauthUrl] = React.useState<string | null>(null)

  async function changeTo(plan: "PRO" | "ENTERPRISE") {
    setError(null)
    setNote(null)
    setReauthUrl(null)

    const parts: string[] = [`¿Cambiar el plan de esta cuenta a ${plan}?`]
    if (plan === "PRO" && hasCustomPlan) {
      parts.push("Se borrará el precio custom actual (Enterprise) y se ajustarán los límites a PRO.")
    }
    if (plan === "PRO" && hasPreapproval) {
      parts.push("Se reprogramará el cobro de MercadoPago al precio PRO vigente en el próximo vencimiento.")
    }
    if (plan === "ENTERPRISE") {
      parts.push("Después vas a poder fijarle un precio custom para que MP cobre el monto acordado.")
    }
    if (!window.confirm(parts.join("\n\n"))) return

    setSaving(plan)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/change-plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      if (body.note) setNote(body.note)
      if (body.reauth_checkout_url) setReauthUrl(body.reauth_checkout_url)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cambiar plan</CardTitle>
        <CardDescription>
          Cambia el plan de la cuenta y ajusta sus límites. Plan actual:{" "}
          <strong>{currentPlan ?? "—"}</strong>
          {hasCustomPlan && " (con precio custom)"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {TARGETS.map((t) => {
            const isCurrent = currentPlan === t.id
            return (
              <Button
                key={t.id}
                variant={isCurrent ? "secondary" : "outline"}
                disabled={isCurrent || saving !== null}
                onClick={() => changeTo(t.id)}
              >
                {saving === t.id ? "Cambiando..." : isCurrent ? `${t.label} (actual)` : `Cambiar a ${t.label}`}
              </Button>
            )
          })}
        </div>

        {note && (
          <div className="rounded border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            {note}
          </div>
        )}
        {reauthUrl && (
          <div className="rounded border border-accent-coral/40 bg-accent-coral/10 p-3 text-sm text-accent-coral">
            El cliente debe re-autorizar el nuevo monto en MercadoPago:{" "}
            <a href={reauthUrl} target="_blank" rel="noopener noreferrer" className="underline">
              abrir checkout
            </a>
          </div>
        )}
        {error && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
