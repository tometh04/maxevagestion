import type { EmiliaFlight, EurovipsHotel } from "./quotation-mapper"

export type ProductState = "searching" | "available" | "empty" | "failed"
export interface EmiliaProgressView {
  version: number
  attempt: number
  products: Partial<Record<"flights" | "hotels", ProductState>>
}

export interface EmiliaChatMessage {
  id?: string
  jobId?: string
  attempt?: number
  role: "user" | "assistant"
  text: string
  jobStatus?: "queued" | "processing" | "completed" | "failed" | "interrupted"
  progress?: EmiliaProgressView
  cards?: {
    flights?: { count: number; items: EmiliaFlight[] }
    hotels?: { count: number; items: EurovipsHotel[] }
    requestType?: string
  }
  meta?: Record<string, any>
}

export interface EmiliaTurnUpdate {
  job_id?: string
  status?: string
  stage?: string
  attempt?: number
  progress?: EmiliaProgressView
  results?: EmiliaChatMessage["cards"]
  requestType?: string
  message?: string
  missing_fields?: string[]
  assistant_message?: { content?: { text?: string }; meta?: EmiliaChatMessage["meta"] }
}

/** One response per job. Terminal responses win; snapshots replace only newer versions. */
export function applyEmiliaTurnUpdate(
  messages: EmiliaChatMessage[], key: string, update: EmiliaTurnUpdate,
): EmiliaChatMessage[] {
  const index = messages.findIndex(message => message.role === "assistant"
    && (message.id === key || message.jobId === key || (update.job_id && message.jobId === update.job_id)))
  const previous = index >= 0 ? messages[index] : undefined
  const pending = update.status === "queued" || update.status === "processing"
  if (pending && (previous?.jobStatus === "completed" || previous?.jobStatus === "failed")) return messages
  const previousAttempt = previous?.attempt || previous?.progress?.attempt || 0
  if (pending && update.attempt && update.attempt < previousAttempt) return messages
  const newAttempt = Boolean(update.attempt && update.attempt > previousAttempt)
  if (pending && previous?.progress && previous.jobStatus !== "interrupted" && !newAttempt
    && (!update.progress || update.progress.version <= previous.progress.version)) return messages
  const progress = update.progress || (newAttempt ? undefined : previous?.progress)
  const ready = Object.values(progress?.products || {}).some(state => state === "available")
  const allReady = progress && Object.values(progress.products).every(state => state !== "searching")
  const jobId = update.job_id || previous?.jobId
  const message: EmiliaChatMessage = {
    ...previous,
    id: previous?.id || key,
    jobId,
    attempt: update.attempt || update.progress?.attempt || previous?.attempt,
    role: "assistant",
    jobStatus: pending ? update.status as "queued" | "processing" : update.status === "failed" ? "failed" : "completed",
    progress: pending ? progress : undefined,
    text: pending
      ? allReady ? "Terminando tu búsqueda…" : ready ? "Ya podés ver las primeras opciones." : "Preparando tu búsqueda…"
      : update.assistant_message?.content?.text || update.message || "Acá tenés los resultados:",
    cards: update.results ? { ...update.results, requestType: update.requestType }
      : pending && !newAttempt ? previous?.cards : undefined,
    meta: {
      ...(!newAttempt ? previous?.meta : {}),
      ...update.assistant_message?.meta,
      ...(update.status === "incomplete" ? { missing_fields: update.missing_fields || [] } : {}),
      ...(jobId ? { searchContextId: `turn_${jobId}` } : {}),
    },
  }
  if (index < 0) return [...messages, message]
  return messages.map((entry, i) => i === index ? message : entry)
}

export function interruptEmiliaTurn(messages: EmiliaChatMessage[], key: string, text: string, terminal: boolean) {
  return messages.map(message => message.role === "assistant" && (message.id === key || message.jobId === key)
    ? { ...message, text, jobStatus: terminal ? "failed" as const : "interrupted" as const,
        progress: message.progress ? { ...message.progress, products: Object.fromEntries(
          Object.entries(message.progress.products).map(([product, state]) => [product, state === "searching" ? "failed" : state]),
        ) } : undefined }
    : message)
}
