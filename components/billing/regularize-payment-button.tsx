"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

/**
 * Botón "Regularizar pago" para orgs con status PAST_DUE.
 *
 * Flujo: cancela el preapproval viejo que está fallando en cobrar,
 * crea uno nuevo SIN trial → MP cobra inmediatamente al aceptar.
 */
export function RegularizePaymentButton({ plan }: { plan: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRegularize() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, regularize: true }),
      })
      const data = await res.json()
      if (!res.ok || !data.init_point) {
        throw new Error(data.error || "No se pudo generar el link de pago")
      }
      window.location.href = data.init_point
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Tu medio de pago actual falló. Para seguir usando Vibook necesitás
          regularizar tu suscripción ingresando una tarjeta válida. Se te cobrará
          inmediatamente al completar el checkout.
        </p>
      </div>
      <Button
        onClick={handleRegularize}
        disabled={loading}
        variant="destructive"
        size="lg"
        className="w-full sm:w-auto"
      >
        {loading ? "Procesando…" : "Regularizar pago"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
