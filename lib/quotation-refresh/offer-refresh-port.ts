import type {
  OfferRefreshFallback,
  OfferSource,
  RefreshCostBasis,
  RemoteOfferRefreshResponse,
} from "@/lib/quotation-refresh/types"

export interface OfferRefreshRequestItem {
  client_item_id: string
  current: { amount: number; currency: string; basis: RefreshCostBasis }
  source?: OfferSource
  fallback?: OfferRefreshFallback
}
export interface OfferRefreshJobSnapshot {
  jobId: string
  requestId: string
  status: "queued" | "processing" | "completed" | "failed"
  stage: string
  result: RemoteOfferRefreshResponse | null
  error: { code?: string; message: string; retryable?: boolean } | null
}
export interface OfferRefreshPort {
  refresh(input: {
    apiKey: string
    requestId: string
    items: OfferRefreshRequestItem[]
  }): Promise<RemoteOfferRefreshResponse>
  enqueue?(input: {
    apiKey: string
    requestId: string
    items: OfferRefreshRequestItem[]
  }): Promise<OfferRefreshJobSnapshot>
  read?(input: {
    apiKey: string
    jobId: string
    requestId: string
    items: OfferRefreshRequestItem[]
  }): Promise<OfferRefreshJobSnapshot>
}
export class OfferRefreshPortError extends Error {
  constructor(
    public readonly code:
      | "INVALID_CREDENTIAL"
      | "FORBIDDEN"
      | "SOURCE_NOT_FOUND"
      | "IDEMPOTENCY_CONFLICT"
      | "RATE_LIMITED"
      | "REMOTE_UNAVAILABLE"
      | "INVALID_RESPONSE",
    message: string,
    public readonly status?: number
  ) {
    super(message)
    this.name = "OfferRefreshPortError"
  }
}
