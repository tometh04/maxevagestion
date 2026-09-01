export type RefreshProduct = "flights" | "hotels"
export type RefreshCostBasis =
  | "AGENCY_NET"
  | "PROVIDER_TOTAL"
  | "COMMISSIONABLE_GROSS"
  | "UNKNOWN"

export interface OfferSource {
  artifact_id: string
  product: RefreshProduct
  offer_id: string
  selection_id?: string
}

export interface OfferRefreshFallback {
  product: RefreshProduct
  query: Record<string, unknown>
  identity: Record<string, unknown>
}

export type RefreshRunStatus =
  | "RUNNING"
  | "REVIEW_REQUIRED"
  | "APPLIED"
  | "FAILED"
  | "STALE"

export type RefreshOutcome =
  | "UNCHANGED"
  | "PRICE_CHANGED"
  | "UNAVAILABLE"
  | "REPLACEMENT_FOUND"
  | "NOT_REFRESHABLE"
  | "FAILED"

export type RefreshAction = "USE_REFRESHED" | "USE_REPLACEMENT" | "KEEP_CURRENT"

export interface PriceSnapshot {
  cost_amount: number
  sale_amount?: number
  currency: string
  cost_basis: RefreshCostBasis
  conditions?: unknown
}

export interface RefreshCandidate {
  id: string
  label: string
  cost_amount: number
  currency: string
  cost_basis: RefreshCostBasis
  conditions?: unknown
  differences?: Array<{ field: string; before: unknown; after: unknown; material: boolean }>
}

export interface RefreshItemView {
  line_id: string
  option_id: string
  option_title: string
  quotation_item_id: string
  item_type: string
  label: string
  quantity: number
  outcome: RefreshOutcome
  current: PriceSnapshot
  refreshed?: PriceSnapshot
  delta_amount?: number
  condition_changes?: string[]
  differences?: Array<{ field: string; before: unknown; after: unknown; material: boolean }>
  error?: { code?: string; message: string; retryable: boolean } | null
  candidates?: RefreshCandidate[]
  allowed_actions: RefreshAction[]
  requires_decision: boolean
}

export interface RefreshOptionSummary {
  option_id: string
  option_title: string
  current_cost_total: number
  proposed_cost_total: number
  current_customer_total: number
  suggested_customer_total: number
  current_margin: number
  suggested_margin: number
  manual_total_requires_confirmation: boolean
}

export interface RefreshSummary {
  currency: string
  item_count: number
  unchanged_count: number
  price_changed_count: number
  unavailable_count: number
  replacement_count: number
  not_refreshable_count: number
  failed_count: number
  options: RefreshOptionSummary[]
}

export interface QuotationRefreshRunView {
  id: string
  quotation_id: string
  status: RefreshRunStatus
  source_updated_at: string
  quotation_updated_at: string
  updated_at: string
  requested_at: string
  completed_at: string | null
  applied_at: string | null
  valid_until: string | null
  summary: RefreshSummary
  items: RefreshItemView[]
  apply_blockers: Array<{ code: string; message: string }>
  error: string | null
}

export interface RemoteOfferRefreshItem {
  client_item_id: string
  source?: {
    type?: "search_artifact"
    artifact_id: string
    product: RefreshProduct
    offer_id: string
    selection_id?: string
  }
  method: "exact_reprice" | "fresh_research" | "none"
  outcome: RefreshOutcome
  confidence: "exact" | "equivalent" | "alternative" | "none"
  product: RefreshProduct
  provider: string | null
  previous: { price: { amount: number; currency: string; basis: RefreshCostBasis } }
  current: null | {
    price: { amount: number; currency: string; basis: RefreshCostBasis }
    source?: OfferSource & { type?: "search_artifact" }
    identity?: Record<string, unknown>
  }
  candidates: Array<{
    provider: string
    source?: OfferSource & { type?: "search_artifact" }
    price: { amount: number; currency: string; basis: RefreshCostBasis }
    identity: Record<string, unknown>
    confidence: "equivalent" | "alternative"
    differences: Array<{ field: string; before: unknown; after: unknown; material: boolean }>
  }>
  differences: Array<{ field: string; before: unknown; after: unknown; material: boolean }>
  allowed_actions: Array<
    | "KEEP_CURRENT"
    | "APPLY_PRICE"
    | "SELECT_REPLACEMENT"
    | "RETRY"
    | "REVIEW"
  >
  provider_checked_at: string
  provider_expires_at: string | null
  error: null | { code: string; message: string; retryable: boolean }
}

export interface RemoteOfferRefreshResponse {
  schema_version: "offer-refresh.v1"
  request_id: string
  status: "complete" | "partial" | "failed"
  checked_at: string
  items: RemoteOfferRefreshItem[]
  is_retry?: boolean
  cached_at?: string
}
