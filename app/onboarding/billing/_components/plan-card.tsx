"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PLANS, SALES_CONTACT_URL, formatArs, type PlanId } from "@/lib/billing/plans"

export function PlanCard({ planId }: { planId: PlanId }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const plan = PLANS[planId]

  if (plan.contactSalesOnly) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle>{plan.name}</CardTitle>
          <div className="text-2xl font-bold">{plan.priceLabel || "Consultar"}</div>
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1 mb-4">
            {plan.features.map((f) => <li key={f}>• {f}</li>)}
          </ul>
          <Button asChild className="w-full" variant="outline">
            <a href={SALES_CONTACT_URL} target="_blank" rel="noopener noreferrer">
              Hablar por WhatsApp
            </a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  async function elegir() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      })
      const body = await res.json()
      if (!res.ok || !body.init_point) {
        setError(body.error || "No se pudo iniciar el checkout")
        setLoading(false)
        return
      }
      window.location.href = body.init_point
    } catch (err: any) {
      setError(err.message || "Error inesperado")
      setLoading(false)
    }
  }

  return (
    <Card className="border-2 border-blue-500 relative">
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full">
        Recomendado
      </div>
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <div className="text-3xl font-bold">
          {plan.priceArsMonthly !== null ? (
            <>
              {formatArs(plan.priceArsMonthly)}
              <span className="text-sm font-normal text-muted-foreground"> /mes</span>
            </>
          ) : "—"}
        </div>
        {plan.trialDays ? (
          <p className="text-xs text-green-600 font-medium">
            {plan.trialDays} días gratis · sin cobro hasta el día {plan.trialDays + 1}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">{plan.description}</p>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-1 mb-4">
          {plan.features.map((f) => <li key={f}>✓ {f}</li>)}
        </ul>
        <Button onClick={elegir} disabled={loading} className="w-full">
          {loading ? "Procesando…" : "Elegir este plan"}
        </Button>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </CardContent>
    </Card>
  )
}
