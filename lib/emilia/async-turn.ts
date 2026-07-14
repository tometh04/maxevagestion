export interface EmiliaQueuedTurn {
  job_id: string
  request_id: string
  status: "queued" | "processing"
  stage?: string
  poll_after_ms?: number
}

function abortError() {
  return new DOMException("La búsqueda fue cancelada", "AbortError")
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const onAbort = () => {
      clearTimeout(timeout)
      reject(abortError())
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

export async function waitForEmiliaJob({
  jobId,
  conversationId,
  pollAfterMs = 1500,
  maxWaitMs = 360_000,
  signal,
}: {
  jobId: string
  conversationId: string
  pollAfterMs?: number
  maxWaitMs?: number
  signal?: AbortSignal
}): Promise<any> {
  const startedAt = Date.now()
  let delayMs = Math.min(Math.max(pollAfterMs, 500), 5000)

  while (Date.now() - startedAt < maxWaitMs) {
    await wait(delayMs, signal)
    const response = await fetch(
      `/api/emilia/chat/jobs/${encodeURIComponent(jobId)}?conversationId=${encodeURIComponent(conversationId)}`,
      { signal, cache: "no-store" }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error || "No se pudo consultar el estado de Emilia")
    }
    if (data.status === "failed") {
      throw new Error(data?.error?.message || data?.message || "Emilia no pudo completar la búsqueda")
    }
    if (data.status !== "queued" && data.status !== "processing") {
      return data
    }
    delayMs = Math.min(Math.max(Number(data.poll_after_ms) || delayMs, 500), 5000)
  }

  throw new Error("La búsqueda sigue procesándose. Podés cerrar y volver a abrir el chat para retomarla.")
}
