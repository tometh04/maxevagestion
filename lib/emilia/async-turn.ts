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
  let consecutiveTransientFailures = 0
  let firstPoll = true
  let lastProgressVersion = 0
  let lastAttempt = 0

  while (Date.now() - startedAt < maxWaitMs) {
    if (!firstPoll || !immediate) await wait(delayMs, signal)
    firstPoll = false
    if (signal?.aborted) throw abortError()
    let response: Response
    try {
      response = await fetch(
        `/api/emilia/chat/jobs/${encodeURIComponent(jobId)}?conversationId=${encodeURIComponent(conversationId)}`,
        { signal, cache: "no-store" }
      )
    } catch (error: any) {
      if (error?.name === "AbortError") throw error
      consecutiveTransientFailures += 1
      if (consecutiveTransientFailures <= 3) {
        delayMs = Math.min(delayMs * 2, 5000)
        continue
      }
      throw new EmiliaJobError("Se perdió la conexión mientras Emilia terminaba. Volvé a intentar.", "transport")
    }

    let data: any
    try {
      data = await response.json()
    } catch {
      consecutiveTransientFailures += 1
      if (consecutiveTransientFailures <= 3) {
        delayMs = Math.min(delayMs * 2, 5000)
        continue
      }
      throw new EmiliaJobError("La respuesta de Emilia llegó incompleta. Volvé a intentar.", "transport")
    }
    if (!response.ok) {
      const message = data?.error?.message || data?.error || "No se pudo consultar el estado de Emilia"
      if (response.status === 429 || response.status >= 500) {
        consecutiveTransientFailures += 1
        if (consecutiveTransientFailures <= 3) {
          delayMs = Math.min(delayMs * 2, 5000)
          continue
        }
      }
      throw new EmiliaJobError(message, "http", response.status)
    }
    consecutiveTransientFailures = 0
    if (signal?.aborted) throw abortError()
    if (data.progress && Number(data.progress.version) > lastProgressVersion) {
      lastProgressVersion = Number(data.progress.version)
      lastAttempt = Number(data.attempt) || Number(data.progress.attempt)
      onProgress?.({ ...data, status: "processing" })
    } else if (Number(data.attempt) > lastAttempt || lastProgressVersion === 0) {
      lastAttempt = Number(data.attempt) || 0
      if (data.status === "queued" || data.status === "processing") onProgress?.(data)
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
