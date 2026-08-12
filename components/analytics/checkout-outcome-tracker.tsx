"use client"

// Emite `checkout_returned` cuando Mercado Pago devuelve al usuario a una
// pantalla server-rendered (`/settings/subscription?checkout=done|failed`).
//
// Existe porque esa page es un Server Component y no puede llamar a `trackEvent`.
// El flujo de alta (`/onboarding/billing/return`) ya es client y emite el evento
// por su cuenta.

import { useEffect, useRef } from "react"

import { trackEvent } from "@/lib/analytics/ga/track"

export function CheckoutOutcomeTracker({
  result,
}: {
  result: "done" | "pending" | "failed"
}) {
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    trackEvent("checkout_returned", { result })
  }, [result])

  return null
}
