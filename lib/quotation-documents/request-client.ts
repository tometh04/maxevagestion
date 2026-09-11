/** Bounds both the connection and response body; never retries a write. */
export async function requestQuotationJson(url: string, init: RequestInit = {}) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal })
        const json = await response.json().catch(() => ({}))
        return { response, json }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(init.method && init.method !== "GET"
            ? "El servidor tardó demasiado. Volvé a abrir la cotización para comprobar si se guardó antes de reintentar."
            : "El servidor tardó demasiado. Volvé a intentar cargar la cotización."))
          controller.abort()
        }, 45_000)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
