"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

const POLL_INTERVAL_MS = 2000
const MAX_POLL_MS = 30_000

/**
 * Landing post-MP.
 *
 * Flow preferido (sync activo):
 *   1. MP redirige con ?preapproval_id=<id> (+ ?status=, ?external_reference=...)
 *   2. Llamamos POST /api/billing/sync con ese id → cierra el loop.
 *   3. Si 200 → redirect /dashboard.
 *
 * Fallback (sin preapproval_id, p.ej. vuelta manual): polling a
 * /api/billing/status hasta que el webhook haga su trabajo.
 *
 * En ambos casos, si tras 30s no hay éxito, mostramos mensaje con botón
 * manual y link de soporte.
 */
export default function OnboardingBillingReturnPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const started = Date.now()
    let cancelled = false

    const preapprovalId =
      searchParams.get("preapproval_id") ||
      searchParams.get("preapproval_plan_id") ||
      null

    async function trySync(id: string): Promise<boolean> {
      try {
        const res = await fetch("/api/billing/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preapproval_id: id }),
          cache: "no-store",
        })
        if (!res.ok) return false
        const data = await res.json()
        return data.subscription_status === "TRIALING" || data.subscription_status === "ACTIVE"
      } catch {
        return false
      }
    }

    async function tryStatus(): Promise<boolean> {
      try {
        const res = await fetch("/api/billing/status", { cache: "no-store" })
        if (!res.ok) return false
        const data = await res.json()
        return data.status === "TRIALING" || data.status === "ACTIVE"
      } catch {
        return false
      }
    }

    async function check() {
      if (cancelled) return

      // Path A: sync activo si MP nos dio el id
      if (preapprovalId) {
        const ok = await trySync(preapprovalId)
        if (ok) {
          router.replace("/dashboard")
          return
        }
      }

      // Path B: polling por si el webhook llega tarde (o no hay preapprovalId)
      const ok = await tryStatus()
      if (ok) {
        router.replace("/dashboard")
        return
      }

      if (Date.now() - started > MAX_POLL_MS) {
        setTimedOut(true)
        return
      }
      setTimeout(check, POLL_INTERVAL_MS)
    }

    check()
    return () => { cancelled = true }
  }, [router, searchParams])

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
