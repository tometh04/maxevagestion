"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const POLL_INTERVAL_MS = 2000
const MAX_POLL_MS = 30_000

/**
 * Landing post-MP. Responde siempre 200 (incluso sin autenticación) para
 * que la validación de back_url de MP no falle.
 *
 * Si el user está autenticado: polling a /api/billing/status hasta detectar
 * TRIALING o ACTIVE, redirige a /dashboard. Si tras 30s no llega, muestra
 * mensaje conservador y botón manual.
 */
export default function OnboardingBillingReturnPage() {
  const router = useRouter()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const started = Date.now()
    let cancelled = false

    async function check() {
      if (cancelled) return
      try {
        const res = await fetch("/api/billing/status", { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          if (data.status === "TRIALING" || data.status === "ACTIVE") {
            router.replace("/dashboard")
            return
          }
        }
      } catch {
        // retry
      }

      if (Date.now() - started > MAX_POLL_MS) {
        setTimedOut(true)
        return
      }
      setTimeout(check, POLL_INTERVAL_MS)
    }

    check()
    return () => { cancelled = true }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        {!timedOut ? (
          <>
            <div className="mx-auto w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <h1 className="text-xl font-semibold">Procesando tu suscripción…</h1>
            <p className="text-sm text-muted-foreground">
              Mercado Pago está confirmando tu pago. Esto suele tardar unos segundos.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Tardó más de lo esperado</h1>
            <p className="text-sm text-muted-foreground">
              Tu suscripción debería activarse en unos minutos. Si no aparece el dashboard
              al volver, escribinos a <a href="mailto:hola@vibook.ai" className="underline">hola@vibook.ai</a>.
            </p>
            <button
              onClick={() => router.replace("/dashboard")}
              className="text-sm text-blue-600 hover:underline"
            >
              Ir al dashboard →
            </button>
          </>
        )}
      </div>
    </div>
  )
}
