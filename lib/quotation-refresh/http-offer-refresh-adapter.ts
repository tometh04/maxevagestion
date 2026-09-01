import {
  OfferRefreshPortError,
  type OfferRefreshPort,
  type OfferRefreshRequestItem,
} from "@/lib/quotation-refresh/offer-refresh-port"
import type { RemoteOfferRefreshResponse } from "@/lib/quotation-refresh/types"
import { z } from "zod"

const moneySchema = z.object({
  amount: z.number().finite().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  basis: z.enum(["AGENCY_NET", "PROVIDER_TOTAL", "COMMISSIONABLE_GROSS", "UNKNOWN"]),
}).strict()
const sourceSchema = z.object({
  type: z.literal("search_artifact"),
  artifact_id: z.string().uuid(),
  product: z.enum(["flights", "hotels"]),
  offer_id: z.string().trim().min(1).max(512),
  selection_id: z.string().trim().min(1).max(512).optional(),
}).strict()
const differenceSchema = z.object({
  field: z.string().min(1),
  before: z.unknown(),
  after: z.unknown(),
  material: z.boolean(),
}).strict()
const candidateSchema = z.object({
  provider: z.string().min(1),
  source: sourceSchema.optional(),
  price: moneySchema,
  identity: z.record(z.unknown()),
  confidence: z.enum(["equivalent", "alternative"]),
  differences: z.array(differenceSchema),
}).strict()
const itemSchema = z.object({
  client_item_id: z.string().trim().min(1).max(200),
  source: sourceSchema.optional(),
  product: z.enum(["flights", "hotels"]),
  provider: z.string().nullable(),
  method: z.enum(["exact_reprice", "fresh_research", "none"]),
  outcome: z.enum(["UNCHANGED", "PRICE_CHANGED", "UNAVAILABLE", "REPLACEMENT_FOUND", "NOT_REFRESHABLE", "FAILED"]),
  confidence: z.enum(["exact", "equivalent", "alternative", "none"]),
  previous: z.object({ price: moneySchema }).strict(),
  current: z.object({
    price: moneySchema,
    source: sourceSchema.optional(),
    identity: z.record(z.unknown()).optional(),
  }).strict().nullable(),
  candidates: z.array(candidateSchema),
  differences: z.array(differenceSchema),
  allowed_actions: z.array(z.enum(["KEEP_CURRENT", "APPLY_PRICE", "SELECT_REPLACEMENT", "RETRY", "REVIEW"])),
  provider_checked_at: z.string().datetime({ offset: true }),
  provider_expires_at: z.string().datetime({ offset: true }).nullable(),
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
    retryable: z.boolean(),
  }).strict().nullable(),
}).strict()
const responseSchema = z.object({
  schema_version: z.literal("offer-refresh.v1"),
  request_id: z.string().min(1),
  status: z.enum(["complete", "partial", "failed"]),
  checked_at: z.string().datetime({ offset: true }),
  items: z.array(itemSchema).max(50),
  is_retry: z.boolean().optional(),
  cached_at: z.string().datetime({ offset: true }).optional(),
}).strict()
const jobSchema = z.object({
  schema_version: z.literal("offer-refresh-job.v1"),
  success: z.boolean(),
  job_id: z.string().uuid(),
  request_id: z.string().min(1),
  status: z.enum(["queued", "processing", "completed", "failed"]),
  stage: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
  poll_after_ms: z.number().int().nonnegative().optional(),
  result: responseSchema.optional(),
  error: z.object({
    code: z.string().optional(),
    message: z.string(),
    retryable: z.boolean().optional(),
  }).passthrough().optional(),
  created_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }).nullable(),
}).strict()

function offerRefreshUrl() {
  return process.env.EMILIA_OFFER_REFRESH_URL?.trim()
    || "https://api.vibook.ai/v1/offer-refresh"
}
function timeoutMs() {
  const configured = Number(process.env.EMILIA_OFFER_REFRESH_TIMEOUT_MS || 210_000)
  if (!Number.isFinite(configured) || configured <= 0) return 210_000
  return Math.min(Math.max(configured, 30_000), 300_000)
}
function mapRemoteError(status: number) {
  if (status === 401) return "INVALID_CREDENTIAL" as const
  if (status === 403) return "FORBIDDEN" as const
  if (status === 404) return "SOURCE_NOT_FOUND" as const
  if (status === 409) return "IDEMPOTENCY_CONFLICT" as const
  if (status === 429) return "RATE_LIMITED" as const
  return "REMOTE_UNAVAILABLE" as const
}

function jobUrl(url: string) {
  return url.replace(/\/offer-refresh\/?$/, "/offer-refreshes")
}

function requestBody(requestId: string, items: OfferRefreshRequestItem[]) {
  return {
    request_id: requestId,
    items: items.map(item => ({
      client_item_id: item.client_item_id,
      current: item.current,
      source: item.source ? { type: "search_artifact", ...item.source } : undefined,
      fallback: item.fallback,
    })),
  }
}

function parseResponse(payload: unknown, requestId: string, items: OfferRefreshRequestItem[]) {
  const parsed = responseSchema.safeParse(payload)
  const requestedIds = items.map(item => item.client_item_id).sort()
  const returnedIds = parsed.success
    ? parsed.data.items.map(item => item.client_item_id).sort()
    : []
  const requestedById = new Map(items.map(item => [item.client_item_id, item]))
  const responseMatchesRequest = parsed.success && parsed.data.items.every(item => {
    const requested = requestedById.get(item.client_item_id)
    const product = requested?.source?.product || requested?.fallback?.product
    if (!requested || !product || item.product !== product) return false
    if (
      item.previous.price.amount !== requested.current.amount
      || item.previous.price.currency !== requested.current.currency
      || item.previous.price.basis !== requested.current.basis
    ) return false
    const sources = [
      item.source,
      item.current?.source,
      ...item.candidates.map(candidate => candidate.source),
    ].filter(Boolean)
    return sources.every(source => source?.product === product)
  })
  if (
    !parsed.success
    || parsed.data.request_id !== requestId
    || new Set(returnedIds).size !== returnedIds.length
    || JSON.stringify(returnedIds) !== JSON.stringify(requestedIds)
    || !responseMatchesRequest
  ) {
    throw new OfferRefreshPortError(
      "INVALID_RESPONSE",
      "El actualizador devolvió una respuesta inválida."
    )
  }
  return parsed.data as RemoteOfferRefreshResponse
}

function requestProgressDelay(response: Response) {
  const seconds = Number((response as any).headers?.get?.("retry-after"))
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 5_000) : 2_000
}

function waitForRequestProgress(delay: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"))
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delay)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    }, { once: true })
  })
}

export function createHttpOfferRefreshAdapter(input: {
  fetchImpl?: typeof fetch
  url?: string
  timeout?: number
} = {}): OfferRefreshPort {
  const fetchImpl = input.fetchImpl || fetch

  return {
    async enqueue(request) {
      const url = jobUrl(input.url || offerRefreshUrl())
      let response: Response
      let payload: unknown
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            "X-API-Key": request.apiKey,
            "Content-Type": "application/json",
            "User-Agent": "Vibook-Quotation-Refresh/1.0",
          },
          body: JSON.stringify(requestBody(request.requestId, request.items)),
          cache: "no-store",
        })
        payload = await response.json().catch(() => null)
      } catch {
        throw new OfferRefreshPortError("REMOTE_UNAVAILABLE", "No se pudo encolar la actualización de ofertas.")
      }
      if (!response.ok) {
        throw new OfferRefreshPortError(
          mapRemoteError(response.status),
          (payload as any)?.error?.message || "No se pudo encolar la actualización de ofertas.",
          response.status
        )
      }
      const parsed = jobSchema.safeParse(payload)
      if (!parsed.success || parsed.data.request_id !== request.requestId) {
        throw new OfferRefreshPortError("INVALID_RESPONSE", "Wholesale devolvió un job inválido.")
      }
      return {
        jobId: parsed.data.job_id,
        requestId: parsed.data.request_id,
        status: parsed.data.status,
        stage: parsed.data.stage,
        result: parsed.data.result
          ? parseResponse(parsed.data.result, request.requestId, request.items)
          : null,
        error: parsed.data.error || null,
      }
    },

    async read(request) {
      let response: Response
      let payload: unknown
      try {
        response = await fetchImpl(`${jobUrl(input.url || offerRefreshUrl())}/${encodeURIComponent(request.jobId)}`, {
          method: "GET",
          headers: {
            "X-API-Key": request.apiKey,
            "User-Agent": "Vibook-Quotation-Refresh/1.0",
          },
          cache: "no-store",
        })
        payload = await response.json().catch(() => null)
      } catch {
        throw new OfferRefreshPortError("REMOTE_UNAVAILABLE", "No se pudo consultar la actualización de ofertas.")
      }
      if (!response.ok) {
        throw new OfferRefreshPortError(
          mapRemoteError(response.status),
          (payload as any)?.error?.message || "No se pudo consultar la actualización de ofertas.",
          response.status
        )
      }
      const parsed = jobSchema.safeParse(payload)
      if (
        !parsed.success
        || parsed.data.job_id !== request.jobId
        || parsed.data.request_id !== request.requestId
      ) {
        throw new OfferRefreshPortError("INVALID_RESPONSE", "Wholesale devolvió un estado de job inválido.")
      }
      return {
        jobId: parsed.data.job_id,
        requestId: parsed.data.request_id,
        status: parsed.data.status,
        stage: parsed.data.stage,
        result: parsed.data.result
          ? parseResponse(parsed.data.result, request.requestId, request.items)
          : null,
        error: parsed.data.error || null,
      }
    },

    async refresh(request) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), input.timeout || timeoutMs())
      let response: Response
      let payload: any
      try {
        do {
          response = await fetchImpl(input.url || offerRefreshUrl(), {
            method: "POST",
            headers: {
              "X-API-Key": request.apiKey,
              "Content-Type": "application/json",
              "User-Agent": "Vibook-Quotation-Refresh/1.0",
            },
            body: JSON.stringify(requestBody(request.requestId, request.items)),
            signal: controller.signal,
            cache: "no-store",
          })
          payload = await response.json().catch(() => null)
          if (
            response.status === 409
            && payload?.error?.code === "REQUEST_IN_PROGRESS"
          ) {
            await waitForRequestProgress(requestProgressDelay(response), controller.signal)
          }
        } while (
          response.status === 409
          && payload?.error?.code === "REQUEST_IN_PROGRESS"
        )
      } catch (error: any) {
        throw new OfferRefreshPortError(
          "REMOTE_UNAVAILABLE",
          error?.name === "AbortError"
            ? "La consulta de actualización superó el tiempo máximo."
            : "No se pudo conectar con el actualizador de ofertas."
        )
      } finally {
        clearTimeout(timeout)
      }

      if (!response.ok) {
        throw new OfferRefreshPortError(
          mapRemoteError(response.status),
          payload?.error?.message || payload?.message || "No se pudo actualizar la oferta.",
          response.status
        )
      }
      return parseResponse(payload, request.requestId, request.items)
    },
  }
}
