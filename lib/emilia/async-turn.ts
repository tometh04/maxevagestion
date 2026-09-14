import type { EmiliaTurnUpdate } from "./progressive-turn"

export interface EmiliaQueuedTurn {
  job_id: string
  request_id: string
  status: "queued" | "processing"
  stage?: string
  poll_after_ms?: number
}

export type EmiliaJobErrorKind = "job" | "transport" | "http" | "timeout"

export class EmiliaJobError extends Error {
  constructor(
    message: string,
    public readonly kind: EmiliaJobErrorKind,
    public readonly status?: number
  ) {
    super(message)
    this.name = "EmiliaJobError"
  }
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
  onProgress,
  immediate = false,
}: {
  jobId: string
  conversationId: string
  pollAfterMs?: number
  maxWaitMs?: number
  signal?: AbortSignal
  onProgress?: (update: EmiliaTurnUpdate) => void
  immediate?: boolean
}): Promise<any> {
  const startedAt = Date.now()
  let delayMs = Math.min(Math.max(pollAfterMs, 500), 5000)
  let firstPoll = true
  let lastProgressVersion = 0
  let lastAttempt = 0
  let lastStage: string | undefined

  while (Date.now() - startedAt < maxWaitMs) {
    if (!firstPoll || !immediate) await wait(Math.min(delayMs, Math.max(0, maxWaitMs - (Date.now() - startedAt))), signal)
    firstPoll = false
    if (signal?.aborted) throw abortError()
    if (Date.now() - startedAt >= maxWaitMs) break
    let response: Response
    try {
      response = await fetch(
        `/api/emilia/chat/jobs/${encodeURIComponent(jobId)}?conversationId=${encodeURIComponent(conversationId)}`,
        { signal, cache: "no-store" }
      )
    } catch (error: any) {
      if (error?.name === "AbortError") throw error
      delayMs = Math.min(delayMs * 2, 10_000)
      continue
    }

    let data: any
    try {
      data = await response.json()
    } catch {
      delayMs = Math.min(delayMs * 2, 10_000)
      continue
    }
    if (!response.ok) {
      const message = data?.error?.message || data?.error || "No se pudo consultar el estado de Emilia"
      if (response.status === 429 || response.status >= 500) {
        // A polling outage does not mean the durable search failed. Resume the
        // same job within the overall budget, without dispatching another turn.
        delayMs = Math.min(delayMs * 2, 10_000)
        continue
      }
      throw new EmiliaJobError(message, "http", response.status)
    }
    if (signal?.aborted) throw abortError()
    if (data.status === "queued" || data.status === "processing") {
      const version = Number(data.progress?.version) || 0
      const attempt = Number(data.attempt) || Number(data.progress?.attempt) || 0
      if (version > lastProgressVersion || attempt > lastAttempt || data.stage !== lastStage || lastProgressVersion === 0) {
        lastProgressVersion = Math.max(lastProgressVersion, version)
        lastAttempt = Math.max(lastAttempt, attempt)
        lastStage = data.stage
        onProgress?.(data)
      }
    }
    if (data.status === "failed") {
      throw new EmiliaJobError(
        data?.error?.message || data?.message || "Emilia no pudo completar la búsqueda",
        "job"
      )
    }
    if (data.status !== "queued" && data.status !== "processing") {
      return data
    }
    delayMs = Math.min(Math.max(Number(data.poll_after_ms) || delayMs, 500), 5000)
  }

  throw new EmiliaJobError(
    "La búsqueda sigue procesándose. Podés cerrar y volver a abrir el chat para retomarla.",
    "timeout"
  )
}
