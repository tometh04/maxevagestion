// Helper de timing para diagnóstico de navegación lenta.
// Uso: const t = makeTimer('label', requestId?); t.mark('step'); t.end()
// Cada llamada imprime delta del paso anterior + acumulado.
// Para activar/desactivar el logging, set PERF_LOG=0 en env (default = activo).

const ENABLED = process.env.PERF_LOG !== "0"

export function makeTimer(label: string, requestId?: string) {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now()
  const id = requestId || Math.random().toString(36).slice(2, 8)
  const tag = `[perf:${id}] ${label}`
  let last = start

  return {
    id,
    mark(step: string) {
      if (!ENABLED) return
      const now = typeof performance !== "undefined" ? performance.now() : Date.now()
      console.log(
        `${tag} → ${step}: ${(now - last).toFixed(0)}ms (acc ${(now - start).toFixed(0)}ms)`
      )
      last = now
    },
    end(extra?: string) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now()
      const total = (now - start).toFixed(0)
      if (ENABLED) {
        console.log(`${tag} ✓ TOTAL ${total}ms ${extra ?? ""}`)
      }
      return total
    },
  }
}
