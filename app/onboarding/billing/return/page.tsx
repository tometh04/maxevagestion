"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

const POLL_INTERVAL_MS = 2000
const MAX_POLL_MS = 30_000

// Necesario en Next 15: useSearchParams() fuerza dynamic rendering.
export const dynamic = "force-dynamic"

/**
 * Landing post-MP.
 *
 * Flow:
 *   1. MP redirige a esta page (a veces con ?preapproval_id=, a veces sin).
 *   2. Llamamos POST /api/billing/sync. Si viene preapproval_id en query lo
 *      pasamos; si no, el endpoint lo resuelve vía CHECKOUT_INITIATED + MP
 *      search.
 *   3. Si sync responde TRIALING/ACTIVE → redirect /dashboard.
 *   4. Reintentamos cada 2s hasta 30s. Si el preapproval aún no está
 *      authorized en MP (status 202), seguimos reintentando.
 *   5. Tras timeout, mensaje de soporte + botón manual.
 */
export default function OnboardingBillingReturnPage() {
  return (
    <Suspense fallback={<SpinnerCard />}>
      <ReturnClient />
    </Suspense>
  )
}

function SpinnerCard() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="mx-auto w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function ReturnClient() {
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

    async function trySync(): Promise<boolean> {
      try {
        const res = await fetch("/api/billing/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Mandamos preapproval_id si MP lo pasó en el query; si no, el
          // endpoint resuelve vía CHECKOUT_INITIATED + MP search.
          body: JSON.stringify(preapprovalId ? { preapproval_id: preapprovalId } : {}),
          cache: "no-store",
        })
        if (!res.ok) return false
        const data = await res.json()
        return data.subscription_status === "TRIALING" || data.subscription_status === "ACTIVE"
      } catch {
        return false
      }
    }

    async function check() {
      if (cancelled) return

      // Sync activo — funciona con o sin preapproval_id en la URL.
      const ok = await trySync()
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
