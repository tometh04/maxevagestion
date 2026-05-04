"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "long", year: "numeric",
  })
}

export function ReactivateDialog({
  plan,
  currentPeriodEndsAt,
}: {
  plan: string
  currentPeriodEndsAt: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReactivate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, reactivate: true }),
      })
      const data = await res.json()
      if (!res.ok || !data.init_point) throw new Error(data.error || "Reactivación falló")
      window.location.href = data.init_point
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const hasAccessRemaining =
    currentPeriodEndsAt && new Date(currentPeriodEndsAt).getTime() > Date.now()

  return (
    <div className="space-y-2">
      <p className="text-sm">
        {hasAccessRemaining
          ? `Mantenés acceso hasta el ${fmt(currentPeriodEndsAt!)}. Al reactivar, MercadoPago no te cobra hasta esa fecha.`
          : "Al reactivar, te pedimos ingresar tarjeta de nuevo y empezás a pagar desde el primer día."}
      </p>
      <Button onClick={handleReactivate} disabled={loading}>
        {loading ? "Procesando…" : "Reactivar suscripción"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
