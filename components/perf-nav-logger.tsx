"use client"

// [perf-instrumentation] Componente de diagnóstico para correlacionar logs
// del browser con los del server. Loguea cada cambio de pathname con un
// timestamp `performance.now()` (relativo al page load del browser).
// Se monta en app/(dashboard)/layout.tsx. Quitar cuando termine la
// investigación de navegación lenta.
//
// Activar/desactivar con `NEXT_PUBLIC_PERF_LOG=0` en env (default = activo).

import { useEffect } from "react"
import { usePathname } from "next/navigation"

const ENABLED = process.env.NEXT_PUBLIC_PERF_LOG !== "0"

export function PerfNavLogger() {
  const pathname = usePathname()

  useEffect(() => {
    if (!ENABLED) return
    const ts = performance.now().toFixed(0)
    // eslint-disable-next-line no-console
    console.log(`[perf:client] NAV → ${pathname} at ${ts}ms`)
  }, [pathname])

  return null
}
