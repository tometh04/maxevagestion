"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { PLANS, SALES_CONTACT_URL, type PlanId } from "@/lib/billing/plans"
import { trackEvent } from "@/lib/analytics/ga/track"
import type { AnalyticsSurface } from "@/lib/analytics/ga/events"

export function CheckoutButton({
  plan,
  regularize = false,
  surface = "paywall",
}: {
  plan: PlanId
  /**
   * True cuando la org está PAST_DUE: es la MISMA suscripción cuyo cobro falló,
   * no un alta. Sin esto el checkout la trata como cliente nuevo (le cobra el
   * precio de lista aunque tenga un precio congelado) y encima choca con el 409
   * de "ya tenés una suscripción activa" si el preapproval viejo sigue vivo.
   */
  regularize?: boolean
  /** Pantalla desde la que se lanza el checkout, para segmentar el funnel. */
  surface?: AnalyticsSurface
}) {
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
    // Solo el id del plan. `PLANS[plan]` tiene el precio: no se manda.
    trackEvent("plan_selected", { plan_id: plan, surface })
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regularize ? { plan, regularize: true } : { plan }),
      })
      const body = await res.json()
      if (!res.ok || !body.init_point) {
        setError(body.error || "No se pudo iniciar el checkout")
        setLoading(false)
        return
      }
      trackEvent("checkout_started", { plan_id: plan, regularize, surface })
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
        {loading ? "Cargando…" : regularize ? "Regularizar pago" : "Elegir este plan"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
