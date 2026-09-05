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
  stage?: string
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

function pendingTurnText(status: string | undefined, stage: string | undefined, jobId: string | undefined, progress?: EmiliaProgressView): string {
  if (!jobId) return "Tu próxima búsqueda está en camino…"
  if (status === "queued") return "Tu pedido está en fila. Enseguida arrancamos…"
  switch (stage) {
    case "starting": return "Poniendo tu búsqueda en marcha…"
    case "identity_verified": return "Abriendo el mapa de nuestra conversación…"
    case "context_loading": return "Retomando el hilo de lo que veníamos planeando…"
    case "parsing": return "Conectando los detalles de tu próximo viaje…"
    case "routing": return "Trazando el rumbo de la búsqueda…"
    case "state_preparation": return "Dándole forma a lo que encontré…"
    case "context_persistence": return "Guardando los hallazgos de este recorrido…"
    case "finalizing": return "Dando los últimos toques a tu respuesta…"
    case "provider_search": {
      const products = progress?.products
      if (!products) return "Tocando la puerta de los proveedores para consultar disponibilidad…"
      const flightsPending = products.flights === "searching"
      const hotelsPending = products.hotels === "searching"
      if (flightsPending && hotelsPending) return "Explorando cómo llegar y dónde quedarse…"
      if (hotelsPending) return products.flights === "available"
        ? "Los vuelos ya están a la vista. Voy por los hoteles…" : "Buscando hoteles para tu próxima parada…"
      if (flightsPending) return products.hotels === "available"
        ? "Los hoteles ya están a la vista. Voy por los vuelos…" : "Explorando vuelos para tu próximo destino…"
      return "Juntando las piezas de tu búsqueda…"
    }
    default: return "Sigo pendiente de las novedades de tu búsqueda…"
  }
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
  const stage = update.stage ?? (newAttempt ? undefined : previous?.stage)
  if (pending && previous?.progress && !newAttempt && update.progress
    && update.progress.version < previous.progress.version) return messages
  const freshProgress = !previous?.progress || newAttempt
    || Boolean(update.progress && update.progress.version > previous.progress.version)
  if (pending && previous?.progress && previous.jobStatus !== "interrupted" && !freshProgress
    && stage === previous.stage) return messages
  const progress = freshProgress ? update.progress || (newAttempt ? undefined : previous?.progress) : previous?.progress
  const jobId = update.job_id || previous?.jobId
  const message: EmiliaChatMessage = {
    ...previous,
    id: previous?.id || key,
    jobId,
    stage,
    attempt: update.attempt || update.progress?.attempt || previous?.attempt,
    role: "assistant",
    jobStatus: pending ? update.status as "queued" | "processing" : update.status === "failed" ? "failed" : "completed",
    progress: pending ? progress : undefined,
    text: pending
      ? pendingTurnText(update.status, stage, jobId, progress)
      : update.assistant_message?.content?.text || update.message || "Acá tenés los resultados:",
    cards: pending && !freshProgress ? previous?.cards : update.results ? { ...update.results, requestType: update.requestType }
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
