const TRANSIENT_STATUSES = new Set([408, 502, 503, 504])

export async function dispatchEmiliaTurn(url: string, options: RequestInit, timeoutMs: number) {
  // Async creation is idempotent by request_id. Both attempts must send the same body.
  const deadline = Date.now() + timeoutMs
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const remaining = Math.max(1, deadline - Date.now())
    const budget = attempt === 0 ? Math.max(1, Math.floor(remaining / 2)) : remaining
    const timeout = setTimeout(() => controller.abort(), budget)
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      // Keep the deadline active until the body is received too.
      const text = await response.text()
      let data: any
      try { data = JSON.parse(text) } catch { data = { message: text } }
      if (attempt === 0 && TRANSIENT_STATUSES.has(response.status) && Date.now() < deadline) continue
      return { response, data }
    } catch (error) {
      if (attempt === 1 || Date.now() >= deadline) throw error
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error("Emilia dispatch unavailable")
}
