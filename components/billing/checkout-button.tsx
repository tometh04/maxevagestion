"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { PLANS, SALES_CONTACT_URL, type PlanId } from "@/lib/billing/plans"

export function CheckoutButton({ plan }: { plan: PlanId }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const planDef = PLANS[plan]

  // Enterprise / contact-sales → WhatsApp directo en vez de checkout MP.
  if (planDef?.contactSalesOnly) {
    return (
      <Button asChild className="w-full">
        <a href={SALES_CONTACT_URL} target="_blank" rel="noopener noreferrer">
          Hablar por WhatsApp
        </a>
      </Button>
    )
  }

  async function go() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const body = await res.json()
      if (!res.ok || !body.init_point) {
        setError(body.error || "No se pudo iniciar el checkout")
        setLoading(false)
        return
      }
      // Redirect a Mercado Pago — el user completa la suscripción ahí,
      // y MP nos redirige de vuelta a /settings/subscription?checkout=done.
      window.location.href = body.init_point
    } catch (err: any) {
      setError(err.message || "Error inesperado")
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1">
      <Button onClick={go} disabled={loading} className="w-full">
        {loading ? "Cargando…" : "Elegir este plan"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
