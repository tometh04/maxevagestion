import { randomUUID } from "node:crypto"
import { resolveAgencyEmiliaCredential } from "@/lib/emilia/agency-credential"
import { prepareQuotationDocumentForAtomicIssue } from "@/lib/quotation-documents/server"
import {
  buildQuotationStructureRows,
  prepareQuotationOptionsForPersistence,
} from "@/lib/quotations/persistence"
import {
  getQuotationItemEffectiveUnitCost,
  getQuotationOptionCostTotal,
  roundQuotationMoney,
} from "@/lib/quotations/totals"
import type {
  OfferRefreshJobSnapshot,
  OfferRefreshPort,
  OfferRefreshRequestItem,
} from "@/lib/quotation-refresh/offer-refresh-port"
import type {
  OfferRefreshFallback,
  OfferSource,
  QuotationRefreshRunView,
  RefreshAction,
  RefreshCostBasis,
  RefreshItemView,
  RefreshOptionSummary,
  RefreshOutcome,
  RefreshSummary,
  RemoteOfferRefreshItem,
  RemoteOfferRefreshResponse,
} from "@/lib/quotation-refresh/types"

const QUOTATION_SELECT = `
  *,
  lead:lead_id(id, contact_name, contact_phone, contact_email),
  seller:seller_id(id, name, email),
  agency:agency_id(id, name),
  quotation_options(*),
  quotation_items(*)
`

type Db = any

export class QuotationRefreshError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_INPUT"
      | "INVALID_STATE"
      | "QUOTATION_CHANGED"
      | "RUN_CHANGED"
      | "ACTIVE_RUN"
      | "IDEMPOTENCY_CONFLICT"
      | "MISSING_OPERATOR"
      | "CREDENTIAL_UNAVAILABLE"
      | "REMOTE_FAILED"
      | "PERSISTENCE_FAILED",
    message: string,
    public readonly causeValue?: unknown
  ) {
    super(message)
    this.name = "QuotationRefreshError"
  }
}
export interface QuotationRefreshStartInput {
  quotationId: string
  orgId: string
  agencyId: string
  actorId: string
  expectedUpdatedAt: string
  idempotencyKey: string
}
export interface QuotationRefreshReadInput {
  quotationId: string
  runId: string
  orgId: string
  agencyId: string
}

export interface QuotationRefreshApplyInput extends QuotationRefreshReadInput {
  actorId: string
  expectedUpdatedAt: string
  expectedRunUpdatedAt: string
  decisions: Array<{
    line_id: string
    action: RefreshAction
    candidate_id?: string
  }>
  optionDecisions: Array<{
    option_id: string
    sale_total: number | null
    confirmed: boolean
  }>
}

export interface QuotationRefreshDiscardInput extends QuotationRefreshReadInput {
  expectedRunUpdatedAt: string
}

interface SourceLine {
  row: Record<string, any>
  option: Record<string, any>
  expectedCurrency: string
  costBasis: RefreshCostBasis
  rawAmount?: number
  notRefreshableCode?: string
  notRefreshableReason?: string
  request?: OfferRefreshRequestItem
}

function finiteMoney(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? roundQuotationMoney(amount) : 0
}

function itemCurrency(row: Record<string, any>, quotation?: Record<string, any>) {
  return String(row.cost_currency || row.currency || quotation?.currency || "").trim().toUpperCase()
}

function itemCostBasis(row: Record<string, any>): RefreshCostBasis {
  return ["AGENCY_NET", "PROVIDER_TOTAL", "COMMISSIONABLE_GROSS"].includes(String(row.cost_basis))
    ? row.cost_basis as RefreshCostBasis
    : "UNKNOWN"
}

function comparableRawAmount(row: Record<string, any>, basis = itemCostBasis(row)) {
  if (
    (basis === "AGENCY_NET" || basis === "PROVIDER_TOTAL")
    && row.cost_calculation_mode === "SIMPLE"
  ) {
    const amount = Number(row.cost_amount)
    return Number.isFinite(amount) && amount > 0 ? roundQuotationMoney(amount) : undefined
  }
  if (basis === "COMMISSIONABLE_GROSS" && row.cost_calculation_mode === "COMMISSIONABLE") {
    const amount = Number(row.gross_price)
    return Number.isFinite(amount) && amount > 0 ? roundQuotationMoney(amount) : undefined
  }
  return undefined
}

function applyRawCost(
  row: Record<string, any>,
  price: { amount: number; currency: string; basis: RefreshCostBasis }
) {
  const amount = finiteMoney(price.amount)
  if (
    (price.basis === "AGENCY_NET" || price.basis === "PROVIDER_TOTAL")
    && row.cost_calculation_mode === "SIMPLE"
  ) {
    return {
      cost_amount: amount,
      cost_currency: price.currency,
      gross_price: row.gross_price,
    }
  }
  if (price.basis === "COMMISSIONABLE_GROSS" && row.cost_calculation_mode === "COMMISSIONABLE") {
    return {
      cost_amount: row.cost_amount,
      cost_currency: price.currency,
      gross_price: amount,
    }
  }
  throw new QuotationRefreshError(
    "INVALID_INPUT",
    `La base de costo de ${itemLabel(row)} no es compatible con su modo de cálculo.`
  )
}

function effectiveCostWithPrice(
  row: Record<string, any>,
  price: { amount: number; currency: string; basis: RefreshCostBasis }
) {
  return getQuotationItemEffectiveUnitCost({ ...row, ...applyRawCost(row, price) })
}

function runLeaseExpired(run: Record<string, any>, nowMs = Date.now()) {
  const startedAt = Date.parse(String(run.created_at || ""))
  return run.status === "RUNNING"
    && Number.isFinite(startedAt)
    && nowMs - startedAt > 15 * 60_000
}

function reviewExpired(run: Record<string, any>, nowMs = Date.now()) {
  const validUntil = Date.parse(String(run.valid_until || ""))
  return run.status === "REVIEW_REQUIRED"
    && (!Number.isFinite(validUntil) || validUntil <= nowMs)
}

function reviewTtlMs() {
  const seconds = Number(process.env.QUOTATION_PRICE_REFRESH_REVIEW_TTL_SECONDS || 900)
  const boundedSeconds = Number.isFinite(seconds) ? Math.min(3600, Math.max(60, seconds)) : 900
  return boundedSeconds * 1000
}

function remoteValidUntil(remote: RemoteOfferRefreshResponse, nowMs: number) {
  const checkedAt = Date.parse(remote.checked_at)
  const base = Number.isFinite(checkedAt) ? Math.min(checkedAt, nowMs) : nowMs
  const expirations = remote.items.flatMap(item => {
    const value = item.provider_expires_at ? Date.parse(item.provider_expires_at) : Number.NaN
    return Number.isFinite(value) ? [value] : []
  })
  return new Date(Math.min(base + reviewTtlMs(), ...expirations)).toISOString()
}

function sourceFrom(value: unknown): OfferSource | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (
    typeof record.artifact_id !== "string"
    || (record.product !== "flights" && record.product !== "hotels")
    || typeof record.offer_id !== "string"
    || !record.artifact_id.trim()
    || !record.offer_id.trim()
  ) return undefined
  return {
    artifact_id: record.artifact_id.trim(),
    product: record.product,
    offer_id: record.offer_id.trim(),
    ...(typeof record.selection_id === "string" && record.selection_id.trim()
      ? { selection_id: record.selection_id.trim() }
      : {}),
  }
}

function fallbackDepartureAt(value: unknown, date: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined
  const normalized = value.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized
  if (
    typeof date === "string"
    && /^\d{4}-\d{2}-\d{2}/.test(date.trim())
    && /^\d{1,2}:\d{2}/.test(normalized)
  ) {
    return `${date.trim().slice(0, 10)}T${normalized}`
  }
  return undefined
}

function flightFallback(item: Record<string, any>, quotation: Record<string, any>): OfferRefreshFallback | undefined {
  const legs = Array.isArray(item.flight_details?.legs) ? item.flight_details.legs : []
  let segments = legs.flatMap((leg: any, legIndex: number) => {
    const legDate = leg?.flight_type === "inbound" || legIndex > 0
      ? item.flight_return_date || quotation.return_date
      : item.flight_date || quotation.departure_date
    if (Array.isArray(leg?.segments)) {
      return leg.segments.map((segment: any) => ({
        marketing_airline: segment.marketing_airline ?? segment.marketingAirline ?? segment.airline_code ?? segment.airline ?? null,
        flight_number: segment.flight_number ?? segment.flightNumber ?? null,
        origin: segment.origin ?? segment.departure?.airport_code ?? segment.departure?.airportCode ?? segment.departure?.city_code,
        destination: segment.destination ?? segment.arrival?.airport_code ?? segment.arrival?.airportCode ?? segment.arrival?.city_code,
        departure_at: fallbackDepartureAt(
          segment.departure_at ?? segment.departureAt
            ?? (segment.departure?.date && segment.departure?.time
              ? `${segment.departure.date}T${segment.departure.time}`
              : segment.departure?.date ?? segment.departure?.time),
          legDate
        ),
      }))
    }
    return [{
      marketing_airline: item.airline ?? null,
      flight_number: null,
      origin: leg?.departure?.city_code,
      destination: leg?.arrival?.city_code,
      departure_at: fallbackDepartureAt(leg?.departure_at ?? leg?.departure?.time, legDate),
    }]
  }).filter((segment: any) => segment.origin && segment.destination && segment.departure_at)

  const route = String(item.flight_route || "").split(/\s*-\s*/).map(part => part.trim()).filter(Boolean)
  const firstLegSegments = Array.isArray(legs[0]?.segments) ? legs[0].segments : []
  const detailsOrigin = segments[0]?.origin
  const detailsDestination = firstLegSegments.length > 0
    ? firstLegSegments[firstLegSegments.length - 1]?.destination
      ?? firstLegSegments[firstLegSegments.length - 1]?.arrival?.airport_code
      ?? firstLegSegments[firstLegSegments.length - 1]?.arrival?.airportCode
    : segments[0]?.destination
  const detailsDepartureDate = String(segments[0]?.departure_at || "").slice(0, 10)
  const firstInbound = segments.find((segment: any, index: number) => (
    index > 0 && segment.origin === detailsDestination && segment.destination !== detailsDestination
  ))
  const detailsReturnDate = String(firstInbound?.departure_at || "").slice(0, 10)
  const requestedStops = Number(item.flight_stops)
  const detailsStops = Math.max(0, firstLegSegments.length - 1)
  const topLevelDrift = (
    route.length === 2
    && (normalizeCode(route[0]) !== normalizeCode(detailsOrigin) || normalizeCode(route[1]) !== normalizeCode(detailsDestination))
  ) || (
    item.flight_date && detailsDepartureDate && dateOnly(item.flight_date) !== dateOnly(detailsDepartureDate)
  ) || (
    item.flight_return_date && detailsReturnDate && dateOnly(item.flight_return_date) !== dateOnly(detailsReturnDate)
  ) || (
    Number.isFinite(requestedStops) && firstLegSegments.length > 0 && requestedStops !== detailsStops
  )

  if (topLevelDrift && route.length === 2 && item.flight_date) {
    const stopoverCodes = Array.isArray(item.stopovers)
      ? item.stopovers.map((stopover: any) => String(stopover?.city || "").trim()).filter(Boolean)
      : []
    const outboundPath = [route[0], ...stopoverCodes, route[1]]
    segments = outboundPath.slice(0, -1).map((origin, index) => ({
      marketing_airline: item.airline ?? null,
      flight_number: null,
      origin,
      destination: outboundPath[index + 1],
      departure_at: item.flight_date,
    }))
    if (item.flight_return_date) {
      segments.push({
        marketing_airline: item.airline ?? null,
        flight_number: null,
        origin: route[1],
        destination: route[0],
        departure_at: item.flight_return_date,
      })
    }
  }

  if (segments.length === 0) {
    if (route.length === 2 && route[0] && route[1] && item.flight_date) {
      segments.push({
        marketing_airline: item.airline ?? null,
        flight_number: null,
        origin: route[0],
        destination: route[1],
        departure_at: item.flight_date,
      })
    }
  }
  if (segments.length === 0) return undefined

  return {
    product: "flights",
    query: {
      origin: segments[0].origin,
      destination: route.length === 2 ? route[1] : detailsDestination || segments[0].destination,
      departure_date: item.flight_date || quotation.departure_date,
      return_date: item.flight_return_date || null,
      adults: Number(quotation.adults || 1),
      children: Number(quotation.children || 0),
      infants: Number(quotation.infants || 0),
      cabin: item.flight_class || null,
    },
    identity: {
      kind: "flight",
      segments,
      cabin: item.flight_class || null,
      checked_baggage: typeof item.flight_details?.baggage?.checked === "boolean"
        ? item.flight_details.baggage.checked
        : null,
      carry_on: typeof item.flight_details?.baggage?.carry_on === "boolean"
        ? item.flight_details.baggage.carry_on
        : null,
      refundable: typeof item.flight_details?.refundable === "boolean"
        ? item.flight_details.refundable
        : null,
    },
  }
}

function hotelFallback(item: Record<string, any>, quotation: Record<string, any>): OfferRefreshFallback | undefined {
  return hotelFallbackWithOccupancy(item, quotation, false)
}

function hotelFallbackWithOccupancy(
  item: Record<string, any>,
  quotation: Record<string, any>,
  allowIncompleteMinorAges: boolean
): OfferRefreshFallback | undefined {
  if (!item.hotel_name || !item.checkin_date || !item.checkout_date) return undefined
  if (!allowIncompleteMinorAges && (Number(quotation.children || 0) > 0 || Number(quotation.infants || 0) > 0)) {
    return undefined
  }
  return {
    product: "hotels",
    query: {
      destination: item.destination_city || quotation.destination,
      check_in: item.checkin_date,
      check_out: item.checkout_date,
      adults: Number(quotation.adults || 1),
      children: Number(quotation.children || 0),
      infants: Number(quotation.infants || 0),
      rooms: Number(item.rooms || 1),
    },
    identity: {
      kind: "hotel_room",
      hotel_name: item.hotel_name,
      city: item.destination_city || quotation.destination || null,
      room_name: item.room_type || null,
      board: item.meal_plan || null,
      check_in: item.checkin_date,
      check_out: item.checkout_date,
    },
  }
}

function storedFallback(value: unknown): OfferRefreshFallback | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const fallback = value as Record<string, unknown>
  if (
    (fallback.product !== "flights" && fallback.product !== "hotels")
    || !fallback.query || typeof fallback.query !== "object" || Array.isArray(fallback.query)
    || !fallback.identity || typeof fallback.identity !== "object" || Array.isArray(fallback.identity)
  ) return undefined
  return {
    product: fallback.product,
    query: fallback.query as Record<string, unknown>,
    identity: fallback.identity as Record<string, unknown>,
  }
}

function normalizedText(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ")
    : ""
}

function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : ""
}

function dateOnly(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim())
    ? value.trim().slice(0, 10)
    : ""
}

function minuteTimestamp(value: unknown) {
  if (typeof value !== "string") return ""
  const normalized = value.trim()
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:T|\s)(\d{1,2}:\d{2})/)
  return match ? `${match[1]}T${match[2].padStart(5, "0")}` : dateOnly(normalized)
}

function normalizedCabin(value: unknown) {
  const cabin = normalizeCode(value)
  if (["F", "A", "P", "FIRST", "PRIMERA"].includes(cabin)) return "FIRST"
  if (["C", "J", "D", "I", "Z", "BUSINESS", "EJECUTIVA"].includes(cabin)) return "BUSINESS"
  if (["W", "PREMIUM", "PREMIUM_ECONOMY"].includes(cabin)) return "PREMIUM_ECONOMY"
  if (/^[YMBHKLQTENRSVXGUO]$/.test(cabin) || ["ECONOMY", "ECONOMICA", "TURISTA", "COACH"].includes(cabin)) return "ECONOMY"
  return cabin
}

function normalizedBoard(value: unknown) {
  const board = normalizedText(value).replace(/_/g, " ")
  if (/^(room only|solo alojamiento|alojamiento)$/.test(board)) return "ROOM_ONLY"
  if (/breakfast|desayuno|bed and breakfast|^bb$/.test(board)) return "BREAKFAST"
  if (/half board|media pension|^hb$/.test(board)) return "HALF_BOARD"
  if (/full board|pension completa|^fb$/.test(board)) return "FULL_BOARD"
  if (/all inclusive|todo incluido|^ai$/.test(board)) return "ALL_INCLUSIVE"
  return board.toUpperCase()
}

function numericQueryValue(query: Record<string, unknown>, key: "adults" | "children" | "infants") {
  const direct = Number(query[key])
  if (Number.isFinite(direct)) return direct
  const passengers = query.passengers && typeof query.passengers === "object"
    ? query.passengers as Record<string, unknown>
    : undefined
  const nested = Number(passengers?.[key])
  if (Number.isFinite(nested)) return nested
  const occupancies = Array.isArray(query.occupancies) ? query.occupancies : []
  if (occupancies.length > 0) {
    return occupancies.reduce((total, occupancy) => {
      if (!occupancy || typeof occupancy !== "object") return total
      const record = occupancy as Record<string, unknown>
      if (key === "children" && Array.isArray(record.child_ages)) return total + record.child_ages.length
      if (key === "infants" && Array.isArray(record.infant_ages)) return total + record.infant_ages.length
      const amount = Number(record[key])
      return total + (Number.isFinite(amount) ? amount : 0)
    }, 0)
  }
  return 0
}

function queryRoomCount(query: Record<string, unknown>) {
  const direct = Number(query.rooms)
  if (Number.isFinite(direct) && direct > 0) return direct
  if (Array.isArray(query.rooms)) {
    const total = query.rooms.reduce((sum, room) => {
      if (!room || typeof room !== "object") return sum + 1
      const count = Number((room as Record<string, unknown>).count)
      return sum + (Number.isFinite(count) && count > 0 ? count : 1)
    }, 0)
    if (total > 0) return total
  }
  if (Array.isArray(query.occupancies) && query.occupancies.length > 0) return query.occupancies.length
  return 1
}

function queryContainsMinorAges(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  if (Array.isArray(value)) return value.some(queryContainsMinorAges)
  const record = value as Record<string, unknown>
  for (const key of ["child_ages", "children_ages", "childrenAges", "infant_ages", "infants_ages", "infantAges"]) {
    if (Array.isArray(record[key]) && record[key].length > 0) return true
  }
  return Object.values(record).some(queryContainsMinorAges)
}

function normalizedFallbackIdentity(
  product: "flights" | "hotels",
  identity: Record<string, unknown>
): Record<string, unknown> {
  if (product === "flights") {
    const directSegments = Array.isArray(identity.segments) ? identity.segments : []
    const legs = Array.isArray(identity.legs) ? identity.legs : []
    const segments = directSegments.length > 0
      ? directSegments
      : legs.flatMap((leg: any) => Array.isArray(leg?.segments)
        ? leg.segments.map((segment: any, index: number) => ({
            ...segment,
            __leg_departure_at: index === 0 ? leg?.departure_at ?? leg?.departureAt : undefined,
          }))
        : [])
    const baggage = identity.baggage && typeof identity.baggage === "object"
      ? identity.baggage as Record<string, unknown>
      : {}
    return {
      kind: "flight",
      segments: segments.map((segment: any) => ({
        marketing_airline: segment?.marketing_airline ?? segment?.marketingAirline ?? segment?.airline_code ?? null,
        flight_number: segment?.flight_number ?? segment?.flightNumber ?? null,
        origin: segment?.origin
          ?? segment?.departure?.airport_code
          ?? segment?.departure?.airportCode
          ?? segment?.departure?.city_code,
        destination: segment?.destination
          ?? segment?.arrival?.airport_code
          ?? segment?.arrival?.airportCode
          ?? segment?.arrival?.city_code,
        departure_at: replacementTimestamp(
          segment?.departure,
          segment?.departure_at ?? segment?.departureAt ?? segment?.__leg_departure_at
        ),
      })),
      cabin: identity.cabin ?? null,
      checked_baggage: typeof identity.checked_baggage === "boolean"
        ? identity.checked_baggage
        : typeof baggage.checked === "boolean" ? baggage.checked : null,
      carry_on: typeof identity.carry_on === "boolean"
        ? identity.carry_on
        : typeof baggage.carry_on === "boolean" ? baggage.carry_on : null,
      refundable: typeof identity.refundable === "boolean" ? identity.refundable : null,
    }
  }
  const hotel = identity.hotel && typeof identity.hotel === "object"
    ? identity.hotel as Record<string, unknown>
    : {}
  const room = identity.room && typeof identity.room === "object"
    ? identity.room as Record<string, unknown>
    : {}
  return {
    kind: "hotel_room",
    hotel_name: identity.hotel_name ?? hotel.name ?? null,
    city: identity.city ?? hotel.city ?? null,
    room_name: identity.room_name ?? room.name ?? null,
    board: identity.board ?? room.board ?? null,
    check_in: identity.check_in ?? hotel.check_in ?? hotel.checkIn ?? null,
    check_out: identity.check_out ?? hotel.check_out ?? hotel.checkOut ?? null,
  }
}

function fallbackFingerprint(fallback: OfferRefreshFallback) {
  const query = fallback.query
  const identity = normalizedFallbackIdentity(fallback.product, fallback.identity)
  if (fallback.product === "flights") {
    const segments = Array.isArray(identity.segments) ? identity.segments : []
    return JSON.stringify({
      product: fallback.product,
      kind: identity.kind,
      segments: segments.map((segment: any) => ({
        marketing_airline: normalizeCode(segment?.marketing_airline ?? segment?.marketingAirline),
        flight_number: normalizeCode(segment?.flight_number ?? segment?.flightNumber),
        origin: normalizeCode(segment?.origin ?? segment?.departure?.airport_code ?? segment?.departure?.airportCode),
        destination: normalizeCode(segment?.destination ?? segment?.arrival?.airport_code ?? segment?.arrival?.airportCode),
        departure_at: minuteTimestamp(segment?.departure_at ?? segment?.departureAt ?? (
          segment?.departure?.date && segment?.departure?.time
            ? `${segment.departure.date}T${segment.departure.time}`
            : segment?.departure?.date
        )),
      })),
      cabin: normalizedCabin(identity.cabin ?? query.cabin ?? query.cabin_class ?? query.cabinClass),
      checked_baggage: typeof identity.checked_baggage === "boolean" ? identity.checked_baggage : null,
      carry_on: typeof identity.carry_on === "boolean" ? identity.carry_on : null,
      refundable: typeof identity.refundable === "boolean" ? identity.refundable : null,
      departure_date: dateOnly(query.departure_date ?? query.departureDate),
      return_date: dateOnly(query.return_date ?? query.returnDate),
      adults: numericQueryValue(query, "adults"),
      children: numericQueryValue(query, "children"),
      infants: numericQueryValue(query, "infants"),
    })
  }
  return JSON.stringify({
    product: fallback.product,
    kind: identity.kind,
    hotel_name: normalizedText(identity.hotel_name),
    city: normalizedText(identity.city ?? query.destination ?? query.city),
    room_name: normalizedText(identity.room_name),
    board: normalizedBoard(identity.board),
    check_in: dateOnly(identity.check_in ?? query.check_in ?? query.checkIn ?? query.checkinDate),
    check_out: dateOnly(identity.check_out ?? query.check_out ?? query.checkOut ?? query.checkoutDate),
    adults: numericQueryValue(query, "adults"),
    children: numericQueryValue(query, "children"),
    infants: numericQueryValue(query, "infants"),
    rooms: queryRoomCount(query),
  })
}

function derivedFallback(item: Record<string, any>, quotation: Record<string, any>, forComparison = false) {
  if (item.item_type === "FLIGHT") return flightFallback(item, quotation)
  if (item.item_type === "HOTEL" || item.item_type === "ACCOMMODATION") {
    return forComparison
      ? hotelFallbackWithOccupancy(item, quotation, true)
      : hotelFallback(item, quotation)
  }
  return undefined
}

function refreshReferenceFor(item: Record<string, any>, quotation: Record<string, any>) {
  const persisted = storedFallback(item.offer_refresh_fallback)
  const comparison = derivedFallback(item, quotation, true)
  const persistedStillMatches = Boolean(
    persisted
    && comparison
    && fallbackFingerprint(persisted) === fallbackFingerprint(comparison)
  )
  if (persisted && persistedStillMatches) {
    const source = sourceFrom(item.offer_source)
    return {
      source: !queryContainsMinorAges(persisted.query) && source?.product === persisted?.product
        ? source
        : undefined,
      fallback: persisted,
    }
  }
  return { source: undefined, fallback: derivedFallback(item, quotation) }
}

function replacementIdentityUsable(product: "flights" | "hotels", identity: Record<string, unknown>) {
  if (product === "flights") {
    const legs = Array.isArray(identity.legs) ? identity.legs : []
    return legs.length > 0 && legs.every((leg: any) => {
      const segments = Array.isArray(leg?.segments) ? leg.segments : []
      const first = segments[0]
      const last = segments[segments.length - 1]
      const departureAt = replacementTimestamp(
        first?.departure,
        first?.departure_at ?? first?.departureAt ?? leg?.departure_at ?? leg?.departureAt
      )
      return Boolean(
        segments.length > 0
        && (first?.departure?.airport_code || first?.departure?.airportCode || first?.departure?.code)
        && (last?.arrival?.airport_code || last?.arrival?.airportCode || last?.arrival?.code)
        && /^\d{4}-\d{2}-\d{2}/.test(departureAt)
      )
    })
  }
  const hotel = identity.hotel && typeof identity.hotel === "object" ? identity.hotel as Record<string, unknown> : {}
  const room = identity.room && typeof identity.room === "object" ? identity.room as Record<string, unknown> : {}
  return Boolean(hotel.name && hotel.check_in && hotel.check_out && room.name)
}

function replacementTimestamp(point: any, direct: unknown) {
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  if (point && typeof point === "object") {
    if (typeof point.date === "string" && typeof point.time === "string") {
      return `${point.date}T${point.time}`
    }
    if (typeof point.date === "string") return point.date
  }
  return ""
}

function replacementRow(
  row: Record<string, any>,
  product: "flights" | "hotels",
  identity: Record<string, unknown>
) {
  if (!replacementIdentityUsable(product, identity)) {
    throw new QuotationRefreshError("INVALID_INPUT", "La alternativa no tiene identidad suficiente para reemplazar el servicio.")
  }
  if (product === "flights") {
    const airline = identity.airline && typeof identity.airline === "object"
      ? identity.airline as Record<string, any>
      : {}
    const rawLegs = identity.legs as any[]
    const legs = rawLegs.map((leg, index) => {
      const segments = Array.isArray(leg?.segments) ? leg.segments : []
      const first = segments[0]
      const last = segments[segments.length - 1]
      const departureAt = replacementTimestamp(
        first?.departure,
        first?.departure_at ?? first?.departureAt ?? leg?.departure_at ?? leg?.departureAt
      )
      const arrivalAt = replacementTimestamp(
        last?.arrival,
        last?.arrival_at ?? last?.arrivalAt ?? leg?.arrival_at ?? leg?.arrivalAt
      )
      return {
        departure: {
          city_code: first?.departure?.airport_code || first?.departure?.airportCode || first?.departure?.code || "",
          city_name: first?.departure?.city || first?.departure?.airport_code || first?.departure?.airportCode || "",
          time: first?.departure?.time || departureAt,
        },
        arrival: {
          city_code: last?.arrival?.airport_code || last?.arrival?.airportCode || last?.arrival?.code || "",
          city_name: last?.arrival?.city || last?.arrival?.airport_code || last?.arrival?.airportCode || "",
          time: last?.arrival?.time || arrivalAt,
        },
        duration: "",
        flight_type: index === 0 ? "outbound" : "inbound",
        layovers: segments.slice(0, -1).map((segment: any) => ({
          destination_city: segment?.arrival?.city || segment?.arrival?.airport_code || segment?.arrival?.airportCode || "",
          destination_code: segment?.arrival?.airport_code || segment?.arrival?.airportCode || "",
          waiting_time: "",
        })),
        departure_at: departureAt,
        arrival_at: arrivalAt,
        segments,
      }
    })
    const firstLeg = legs[0]
    const secondLeg = legs[1]
    const route = `${firstLeg.departure.city_code} - ${firstLeg.arrival.city_code}`
    const identityBaggage = identity.baggage && typeof identity.baggage === "object"
      ? identity.baggage as Record<string, unknown>
      : {}
    const checkedBaggage = typeof identity.checked_baggage === "boolean"
      ? identity.checked_baggage
      : typeof identityBaggage.checked === "boolean" ? identityBaggage.checked : null
    const carryOn = typeof identity.carry_on === "boolean"
      ? identity.carry_on
      : typeof identityBaggage.carry_on === "boolean" ? identityBaggage.carry_on : null
    const refundable = typeof identity.refundable === "boolean" ? identity.refundable : null
    return {
      ...row,
      airline: airline.name || airline.code || null,
      flight_route: route,
      flight_date: String(firstLeg.departure_at).slice(0, 10),
      flight_return_date: secondLeg ? String(secondLeg.departure_at).slice(0, 10) : null,
      flight_stops: firstLeg.layovers.length,
      flight_class: typeof identity.cabin === "string" ? identity.cabin : row.flight_class,
      flight_details: {
        legs,
        baggage: { checked: checkedBaggage, carry_on: carryOn },
        refundable,
      },
      flight_screenshot_url: null,
      tariff_id: null,
      notes: null,
      description: [airline.name || airline.code, route, firstLeg.layovers.length ? `${firstLeg.layovers.length} escalas` : "directo"].filter(Boolean).join(" · "),
    }
  }

  const hotel = identity.hotel as Record<string, any>
  const room = identity.room as Record<string, any>
  const nights = Math.max(0, Math.round((Date.parse(hotel.check_out) - Date.parse(hotel.check_in)) / 86_400_000))
  return {
    ...row,
    hotel_name: hotel.name,
    hotel_stars: hotel.stars ?? null,
    destination_city: hotel.city ?? null,
    hotel_address: hotel.address ?? null,
    hotel_phone: null,
    hotel_photo_url: null,
    checkin_date: hotel.check_in,
    checkout_date: hotel.check_out,
    nights: Number.isFinite(nights) ? nights : row.nights,
    room_type: room.name,
    meal_plan: room.board ?? null,
    tariff_id: null,
    notes: null,
    description: [room.name, room.board].filter(Boolean).join(" · "),
  }
}

function sourceLines(quotation: Record<string, any>): SourceLine[] {
  const options = Array.isArray(quotation.quotation_options)
    ? [...quotation.quotation_options].sort((a, b) => Number(a.option_number) - Number(b.option_number))
    : []
  const items = Array.isArray(quotation.quotation_items) ? quotation.quotation_items : []
  return options.flatMap(option => items
    .filter(item => item.option_id === option.id)
    .map(row => {
      const { source, fallback } = refreshReferenceFor(row, quotation)
      const normalizedCurrency = itemCurrency(row, quotation)
      const currencyValid = /^[A-Z]{3}$/.test(normalizedCurrency)
      const quotationCurrency = String(quotation.currency || "USD").trim().toUpperCase()
      const expectedCurrency = currencyValid ? normalizedCurrency : quotationCurrency
      const costBasis = itemCostBasis(row)
      const hasRefreshReference = Boolean(source || fallback)
      const rawAmount = comparableRawAmount(row, costBasis)
      return {
        row,
        option,
        expectedCurrency,
        costBasis,
        rawAmount,
        ...(!hasRefreshReference
          ? { notRefreshableCode: "MISSING_REFRESH_REFERENCE", notRefreshableReason: "El servicio no conserva una referencia ni datos suficientes para volver a consultarlo." }
          : costBasis === "UNKNOWN"
            ? { notRefreshableCode: "PRICE_BASIS_UNCONFIRMED", notRefreshableReason: "El costo guardado no identifica si es neto, total proveedor o bruto comisionable; no se puede comparar sin riesgo." }
            : !currencyValid
              ? { notRefreshableCode: "INVALID_COST_CURRENCY", notRefreshableReason: "La moneda guardada del costo no es un código ISO válido; corregila antes de consultar." }
            : rawAmount === undefined
              ? { notRefreshableCode: "PRICE_BASIS_MODE_MISMATCH", notRefreshableReason: "La base de costo guardada no es compatible con el modo de cálculo del servicio." }
            : {}),
        ...(hasRefreshReference && costBasis !== "UNKNOWN" && currencyValid && rawAmount !== undefined
          ? {
              request: {
                client_item_id: row.id,
                current: {
                  amount: rawAmount,
                  currency: expectedCurrency,
                  basis: costBasis,
                },
                source,
                fallback,
              },
            }
          : {}),
      }
    }))
}

function itemLabel(item: Record<string, any>) {
  return String(
    item.description
    || item.hotel_name
    || item.flight_route
    || item.item_type
    || "Servicio"
  )
}

function candidateLabel(
  product: "flights" | "hotels",
  identity: Record<string, unknown>,
  index: number,
  provider: string
) {
  if (product === "flights") {
    const airline = identity.airline && typeof identity.airline === "object"
      ? identity.airline as Record<string, any>
      : {}
    const leg = Array.isArray(identity.legs) ? identity.legs[0] as any : null
    const segments = Array.isArray(leg?.segments) ? leg.segments : []
    const first = segments[0]
    const last = segments[segments.length - 1]
    const route = [
      first?.departure?.airport_code || first?.departure?.airportCode,
      last?.arrival?.airport_code || last?.arrival?.airportCode,
    ].filter(Boolean).join(" → ")
    const departure = replacementTimestamp(
      first?.departure,
      first?.departure_at ?? first?.departureAt ?? leg?.departure_at ?? leg?.departureAt
    )
    const baggage = typeof identity.checked_baggage === "boolean"
      ? (identity.checked_baggage ? "equipaje despachado" : "sin equipaje despachado")
      : null
    const carryOn = typeof identity.carry_on === "boolean"
      ? (identity.carry_on ? "equipaje de mano" : "sin equipaje de mano")
      : null
    const refundable = typeof identity.refundable === "boolean"
      ? (identity.refundable ? "reembolsable" : "no reembolsable")
      : null
    return [provider, airline.name || airline.code, route, departure, baggage, carryOn, refundable].filter(Boolean).join(" · ")
      || `Alternativa ${index + 1}`
  }
  const hotel = identity.hotel && typeof identity.hotel === "object"
    ? identity.hotel as Record<string, any>
    : {}
  const room = identity.room && typeof identity.room === "object"
    ? identity.room as Record<string, any>
    : {}
  const checkIn = hotel.check_in || hotel.checkIn || identity.check_in || identity.checkIn
  const checkOut = hotel.check_out || hotel.checkOut || identity.check_out || identity.checkOut
  const dates = checkIn && checkOut ? `${checkIn} → ${checkOut}` : null
  const refundableValue = room.refundable ?? identity.refundable
  const refundable = typeof refundableValue === "boolean"
    ? (refundableValue ? "reembolsable" : "no reembolsable")
    : null
  const cancellation = room.cancellation_policy
    || room.cancellationPolicy
    || room.cancellation
    || identity.cancellation_policy
    || identity.cancellationPolicy
  return [provider, hotel.name, room.name, room.board, dates, refundable, cancellation].filter(Boolean).join(" · ")
    || `Alternativa ${index + 1}`
}

function replacementCandidateUsable(
  line: SourceLine,
  remote: RemoteOfferRefreshItem,
  candidate: RemoteOfferRefreshItem["candidates"][number]
) {
  return candidate.price.currency === line.expectedCurrency
    && candidate.price.basis === line.costBasis
    && replacementIdentityUsable(remote.product, candidate.identity)
    && typeof line.row.operator_id === "string"
    && line.row.operator_id.length > 0
    && typeof line.row.provider === "string"
    && line.row.provider.trim().toUpperCase() === candidate.provider.trim().toUpperCase()
}

function exactRefreshMatchesRow(row: Record<string, any>, remote: RemoteOfferRefreshItem) {
  return remote.method === "exact_reprice"
    && typeof remote.provider === "string"
    && remote.provider.trim().length > 0
    && typeof row.provider === "string"
    && row.provider.trim().toUpperCase() === remote.provider.trim().toUpperCase()
}

function exactRefreshMatchesLine(line: SourceLine, remote: RemoteOfferRefreshItem) {
  return exactRefreshMatchesRow(line.row, remote)
}

function translateActions(remote: RemoteOfferRefreshItem, line: SourceLine): RefreshAction[] {
  const expectedCurrency = line.expectedCurrency
  const translated = remote.allowed_actions.flatMap(action => {
    if (
      action === "APPLY_PRICE"
      && exactRefreshMatchesLine(line, remote)
      && remote.current?.price.currency === expectedCurrency
    ) {
      return remote.current.price.basis === line.costBasis ? ["USE_REFRESHED" as const] : []
    }
    if (
      action === "SELECT_REPLACEMENT"
      && remote.candidates.some(candidate => replacementCandidateUsable(line, remote, candidate))
    ) return ["USE_REPLACEMENT" as const]
    if (action === "KEEP_CURRENT") return ["KEEP_CURRENT" as const]
    if (action === "REVIEW") return ["KEEP_CURRENT" as const]
    return []
  })
  return Array.from(new Set(translated))
}

function conditionChanges(remote: RemoteOfferRefreshItem) {
  return remote.differences
    .filter(difference => difference.material && difference.field !== "price.amount")
    .map(difference => difference.field)
}

function toItemView(line: SourceLine, remote?: RemoteOfferRefreshItem): RefreshItemView {
  const currentCost = getQuotationItemEffectiveUnitCost(line.row)
  const currentCurrency = line.expectedCurrency
  if (!remote) {
    return {
      line_id: line.row.id,
      option_id: line.option.id,
      option_title: String(line.option.title || `Opción ${line.option.option_number}`),
      quotation_item_id: line.row.id,
      item_type: String(line.row.item_type || "OTHER"),
      label: itemLabel(line.row),
      quantity: Math.max(0, Number(line.row.quantity ?? 1)),
      outcome: "NOT_REFRESHABLE",
      current: {
        cost_amount: currentCost,
        sale_amount: finiteMoney(line.row.sale_amount ?? line.row.unit_price),
        currency: currentCurrency,
        cost_basis: line.costBasis,
      },
      error: {
        code: line.notRefreshableCode || "MISSING_REFRESH_REFERENCE",
        message: line.notRefreshableReason || "El servicio no conserva datos suficientes para volver a consultarlo sin inventar información.",
        retryable: false,
      },
      allowed_actions: ["KEEP_CURRENT"],
      requires_decision: true,
    }
  }

  const refreshedPrice = remote.current?.price
  const refreshedEffectiveCost = refreshedPrice
    && refreshedPrice.currency === currentCurrency
    && refreshedPrice.basis === line.costBasis
    ? effectiveCostWithPrice(line.row, refreshedPrice)
    : undefined
  const actions = translateActions(remote, line)
  const changes = conditionChanges(remote)
  if (refreshedPrice && refreshedPrice.currency !== currentCurrency) {
    changes.push("price.currency")
  }
  if (refreshedPrice && refreshedPrice.basis !== line.costBasis) {
    changes.push("price.basis")
  }
  const exactProviderMismatch = remote.method === "exact_reprice"
    && !exactRefreshMatchesLine(line, remote)
  const exactMethodRequired = remote.allowed_actions.includes("APPLY_PRICE")
    && remote.method !== "exact_reprice"
  const candidates = (remote.candidates || []).flatMap((candidate, index) => (
    replacementCandidateUsable(line, remote, candidate)
      ? [{
          id: `${line.row.id}:candidate:${index}`,
          label: candidateLabel(remote.product, candidate.identity, index, candidate.provider),
          cost_amount: effectiveCostWithPrice(line.row, candidate.price),
          currency: candidate.price.currency,
          cost_basis: candidate.price.basis,
          conditions: candidate.identity,
          differences: candidate.differences,
        }]
      : []
  ))
  const outcome: RefreshOutcome = exactProviderMismatch || exactMethodRequired
    ? "NOT_REFRESHABLE"
    : remote.outcome

  return {
    line_id: line.row.id,
    option_id: line.option.id,
    option_title: String(line.option.title || `Opción ${line.option.option_number}`),
    quotation_item_id: line.row.id,
    item_type: String(line.row.item_type || "OTHER"),
    label: itemLabel(line.row),
    quantity: Math.max(0, Number(line.row.quantity ?? 1)),
    outcome,
    current: {
      cost_amount: currentCost,
      sale_amount: finiteMoney(line.row.sale_amount ?? line.row.unit_price),
      currency: currentCurrency,
      cost_basis: line.costBasis,
    },
    ...(refreshedPrice && refreshedEffectiveCost !== undefined ? {
      refreshed: {
        cost_amount: refreshedEffectiveCost,
        currency: refreshedPrice.currency,
        cost_basis: refreshedPrice.basis,
        conditions: remote.current?.identity,
      },
      delta_amount: roundQuotationMoney(refreshedEffectiveCost - currentCost),
    } : {}),
    ...(changes.length ? { condition_changes: Array.from(new Set(changes)) } : {}),
    differences: remote.differences.filter(difference => difference.material),
    ...(remote.error ? { error: remote.error } : (
      exactProviderMismatch || exactMethodRequired
        ? { error: { code: "PROVIDER_MISMATCH", message: "La respuesta no confirmó un repricing exacto con el mismo proveedor; el importe no se puede aplicar.", retryable: false } }
        :
      refreshedPrice && refreshedPrice.basis !== line.costBasis
        ? { error: { code: "PRICE_BASIS_MISMATCH", message: "El actualizador devolvió un tipo de costo distinto al guardado; no se puede comparar ni aplicar.", retryable: false } }
        : outcome === "NOT_REFRESHABLE"
        ? { error: { message: "El servicio no tiene datos suficientes para volver a consultarlo.", retryable: false } }
        : outcome === "FAILED"
          ? { error: { message: "El servicio no pudo validarse con el actualizador.", retryable: false } }
          : {}
    )),
    ...(candidates.length ? { candidates } : {}),
    allowed_actions: actions.length ? actions : ["KEEP_CURRENT"],
    requires_decision: outcome !== "UNCHANGED",
  }
}

function proposalCost(item: RefreshItemView) {
  if (
    item.outcome === "PRICE_CHANGED"
    && item.refreshed
    && item.refreshed.currency === item.current.currency
  ) return item.refreshed.cost_amount
  if (item.outcome === "REPLACEMENT_FOUND" && item.candidates?.[0]) return item.candidates[0].cost_amount
  return item.current.cost_amount
}

function makeSummary(quotation: Record<string, any>, items: RefreshItemView[]): RefreshSummary {
  const options = Array.isArray(quotation.quotation_options) ? quotation.quotation_options : []
  const rows = Array.isArray(quotation.quotation_items) ? quotation.quotation_items : []
  const optionSummaries: RefreshOptionSummary[] = options.map(option => {
    const optionRows = rows.filter(item => item.option_id === option.id)
    const optionItems = items.filter(item => item.option_id === option.id)
    const currentCost = getQuotationOptionCostTotal(optionRows)
    const proposedCost = roundQuotationMoney(optionItems.reduce((sum, item) => {
      const source = optionRows.find(row => row.id === item.line_id)
      const quantity = Math.max(0, Number(source?.quantity ?? 1))
      return sum + proposalCost(item) * quantity
    }, 0))
    const customerTotal = finiteMoney(option.manual_total_amount ?? option.total_amount)
    const suggestedTotal = Math.max(customerTotal, proposedCost)
    const changed = optionItems.some(item => ["PRICE_CHANGED", "REPLACEMENT_FOUND"].includes(item.outcome))
    return {
      option_id: option.id,
      option_title: String(option.title || `Opción ${option.option_number}`),
      current_cost_total: currentCost,
      proposed_cost_total: proposedCost,
      current_customer_total: customerTotal,
      suggested_customer_total: suggestedTotal,
      current_margin: roundQuotationMoney(customerTotal - currentCost),
      suggested_margin: roundQuotationMoney(suggestedTotal - proposedCost),
      manual_total_requires_confirmation: changed,
    }
  })
  const count = (outcome: RefreshOutcome) => items.filter(item => item.outcome === outcome).length
  return {
    currency: String(quotation.currency || "USD"),
    item_count: items.length,
    unchanged_count: count("UNCHANGED"),
    price_changed_count: count("PRICE_CHANGED"),
    unavailable_count: count("UNAVAILABLE"),
    replacement_count: count("REPLACEMENT_FOUND"),
    not_refreshable_count: count("NOT_REFRESHABLE"),
    failed_count: count("FAILED"),
    options: optionSummaries,
  }
}

function runView(row: Record<string, any>): QuotationRefreshRunView {
  const proposal = row.proposal_snapshot && typeof row.proposal_snapshot === "object"
    ? row.proposal_snapshot
    : {}
  const sourceItems = Array.isArray(row.source_snapshot?.quotation?.quotation_items)
    ? row.source_snapshot.quotation.quotation_items
    : []
  const missingOperatorCount = sourceItems.filter((item: any) => !item?.operator_id).length
  return {
    id: row.id,
    quotation_id: row.quotation_id,
    status: row.status,
    source_updated_at: row.source_quotation_updated_at,
    quotation_updated_at: row.source_quotation_updated_at,
    updated_at: row.updated_at,
    requested_at: row.created_at,
    completed_at: row.completed_at,
    applied_at: row.applied_at,
    document_issued: Boolean(row.issued_document_id),
    valid_until: row.valid_until || null,
    summary: row.summary || {
      currency: "USD",
      item_count: 0,
      unchanged_count: 0,
      price_changed_count: 0,
      unavailable_count: 0,
      replacement_count: 0,
      not_refreshable_count: 0,
      failed_count: 0,
      options: [],
    },
    items: Array.isArray(proposal.items) ? proposal.items : [],
    apply_blockers: missingOperatorCount > 0
      ? [{
          code: "MISSING_OPERATOR",
          message: `Asigná un operador a ${missingOperatorCount === 1 ? "este servicio" : `los ${missingOperatorCount} servicios`} desde Cotizaciones antes de aplicar.`,
        }]
      : [],
    error: row.error_message || null,
  }
}

function mapDatabaseError(error: any, fallback: string): QuotationRefreshError {
  if (error?.code === "40001") {
    return new QuotationRefreshError("QUOTATION_CHANGED", "La cotización cambió. Volvé a actualizar los precios.", error)
  }
  if (error?.code === "55000") {
    return new QuotationRefreshError("INVALID_STATE", "La actualización ya no se puede aplicar.", error)
  }
  if (error?.code === "23505") {
    return new QuotationRefreshError("ACTIVE_RUN", "Ya existe una actualización activa para esta cotización.", error)
  }
  return new QuotationRefreshError("PERSISTENCE_FAILED", fallback, error)
}

async function refreshInBatches(input: {
  port: OfferRefreshPort
  apiKey: string
  requestId: string
  items: OfferRefreshRequestItem[]
}): Promise<RemoteOfferRefreshResponse> {
  const batches: OfferRefreshRequestItem[][] = []
  for (let index = 0; index < input.items.length; index += 50) {
    batches.push(input.items.slice(index, index + 50))
  }
  const responses: RemoteOfferRefreshResponse[] = []
  for (let index = 0; index < batches.length; index += 1) {
    responses.push(await input.port.refresh({
      apiKey: input.apiKey,
      requestId: batches.length === 1 ? input.requestId : `${input.requestId}_${index + 1}`,
      items: batches[index],
    }))
  }
  const statuses = responses.map(response => response.status)
  return {
    schema_version: "offer-refresh.v1",
    request_id: input.requestId,
    status: statuses.every(status => status === "complete")
      ? "complete"
      : statuses.every(status => status === "failed")
        ? "failed"
        : "partial",
    checked_at: responses.map(response => response.checked_at).sort().at(-1) || new Date().toISOString(),
    items: responses.flatMap(response => response.items),
  }
}

function refreshBatches(requestId: string, items: OfferRefreshRequestItem[]) {
  const batches: Array<{ requestId: string; items: OfferRefreshRequestItem[] }> = []
  for (let index = 0; index < items.length; index += 50) {
    const batch = items.slice(index, index + 50)
    batches.push({
      requestId: items.length <= 50 ? requestId : `${requestId}_${index / 50 + 1}`,
      items: batch,
    })
  }
  return batches
}

function combineJobResults(requestId: string, snapshots: OfferRefreshJobSnapshot[]): RemoteOfferRefreshResponse {
  const responses = snapshots.map(snapshot => snapshot.result).filter(
    (result): result is RemoteOfferRefreshResponse => Boolean(result)
  )
  if (responses.length !== snapshots.length) {
    throw new QuotationRefreshError("REMOTE_FAILED", "Wholesale terminó un job sin resultado de precios.")
  }
  const statuses = responses.map(response => response.status)
  return {
    schema_version: "offer-refresh.v1",
    request_id: requestId,
    status: statuses.every(status => status === "complete")
      ? "complete"
      : statuses.every(status => status === "failed")
        ? "failed"
        : "partial",
    checked_at: responses.map(response => response.checked_at).sort().at(-1) || new Date().toISOString(),
    items: responses.flatMap(response => response.items),
  }
}

export function createQuotationRefreshModule(deps: {
  db: Db
  offerRefresh: OfferRefreshPort
  resolveCredential?: typeof resolveAgencyEmiliaCredential
  prepareDocument?: typeof prepareQuotationDocumentForAtomicIssue
  uuid?: () => string
  now?: () => Date
}) {
  const resolveCredential = deps.resolveCredential || resolveAgencyEmiliaCredential
  const prepareDocument = deps.prepareDocument || prepareQuotationDocumentForAtomicIssue
  const uuid = deps.uuid || randomUUID
  const now = deps.now || (() => new Date())

  async function loadQuotation(input: { quotationId: string; orgId: string; agencyId: string }) {
    const { data, error } = await deps.db
      .from("quotations")
      .select(QUOTATION_SELECT)
      .eq("id", input.quotationId)
      .eq("org_id", input.orgId)
      .eq("agency_id", input.agencyId)
      .maybeSingle()
    if (error || !data) throw new QuotationRefreshError("NOT_FOUND", "Cotización no encontrada.", error)
    return data as Record<string, any>
  }

  async function loadRun(input: QuotationRefreshReadInput) {
    const { data, error } = await deps.db
      .from("quotation_price_refresh_runs")
      .select("*")
      .eq("id", input.runId)
      .eq("quotation_id", input.quotationId)
      .eq("org_id", input.orgId)
      .eq("agency_id", input.agencyId)
      .maybeSingle()
    if (error || !data) throw new QuotationRefreshError("NOT_FOUND", "Actualización no encontrada.", error)
    return data as Record<string, any>
  }

  async function completeRunningRun(
    run: Record<string, any>,
    quotation: Record<string, any>,
    remote: RemoteOfferRefreshResponse
  ) {
    const lines = sourceLines(quotation)
    const remoteByLine = new Map(remote.items.map(item => [item.client_item_id, item]))
    const items = lines.map(line => toItemView(line, remoteByLine.get(line.row.id)))
    const summary = makeSummary(quotation, items)
    const validUntil = remoteValidUntil(remote, now().getTime())
    const alreadyExpired = Date.parse(validUntil) <= now().getTime()
    const { data, error } = await deps.db
      .from("quotation_price_refresh_runs")
      .update({
        status: alreadyExpired ? "STALE" : "REVIEW_REQUIRED",
        proposal_snapshot: { version: 1, items, remote },
        summary,
        completed_at: remote.checked_at,
        valid_until: validUntil,
        error_code: alreadyExpired ? "REVIEW_EXPIRED" : null,
        error_message: alreadyExpired ? "La propuesta venció antes de completar la consulta. Volvé a intentarlo." : null,
      })
      .eq("id", run.id)
      .eq("status", "RUNNING")
      .select("*")
      .single()
    if (error || !data) throw mapDatabaseError(error, "No se pudo guardar la propuesta de actualización.")
    return data as Record<string, any>
  }

  return {
    async start(input: QuotationRefreshStartInput): Promise<QuotationRefreshRunView> {
      const quotation = await loadQuotation(input)
      if (quotation.updated_at !== input.expectedUpdatedAt) {
        throw new QuotationRefreshError("QUOTATION_CHANGED", "La cotización cambió. Recargala antes de actualizar el precio.")
      }
      if (!["DRAFT", "SENT", "PENDING_APPROVAL"].includes(String(quotation.status))) {
        throw new QuotationRefreshError("INVALID_STATE", "La cotización ya no admite actualización de precios.")
      }
      const missingOperatorCount = Array.isArray(quotation.quotation_items)
        ? quotation.quotation_items.filter((item: any) => !item?.operator_id).length
        : 0
      if (missingOperatorCount > 0) {
        throw new QuotationRefreshError(
          "MISSING_OPERATOR",
          `Asigná un operador a ${missingOperatorCount === 1 ? "este servicio" : `los ${missingOperatorCount} servicios`} desde Cotizaciones antes de actualizar precios.`
        )
      }

      const { data: existing } = await deps.db
        .from("quotation_price_refresh_runs")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("agency_id", input.agencyId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle()
      if (existing) {
        if (
          existing.quotation_id !== input.quotationId
          || existing.source_quotation_updated_at !== input.expectedUpdatedAt
        ) {
          throw new QuotationRefreshError(
            "IDEMPOTENCY_CONFLICT",
            "La clave de idempotencia ya fue usada para otra actualización."
          )
        }
        if (runLeaseExpired(existing, now().getTime())) {
          const { data } = await deps.db
            .from("quotation_price_refresh_runs")
            .update({
              status: "FAILED",
              error_code: "RUN_LEASE_EXPIRED",
              error_message: "La consulta anterior no terminó y fue cerrada para poder reintentar.",
              completed_at: now().toISOString(),
            })
            .eq("id", existing.id)
            .eq("status", "RUNNING")
            .eq("updated_at", existing.updated_at)
            .select("*")
            .maybeSingle()
          return runView(data || { ...existing, status: "FAILED", error_message: "La consulta anterior venció." })
        }
        if (reviewExpired(existing, now().getTime())) {
          const { data } = await deps.db
            .from("quotation_price_refresh_runs")
            .update({
              status: "STALE",
              error_code: "REVIEW_EXPIRED",
              error_message: "La propuesta de precios venció. Volvé a consultarla.",
            })
            .eq("id", existing.id)
            .eq("status", "REVIEW_REQUIRED")
            .eq("updated_at", existing.updated_at)
            .select("*")
            .maybeSingle()
          return runView(data || { ...existing, status: "STALE", error_message: "La propuesta de precios venció." })
        }
        return runView(existing)
      }

      const { data: active } = await deps.db
        .from("quotation_price_refresh_runs")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("agency_id", input.agencyId)
        .eq("quotation_id", input.quotationId)
        .in("status", ["RUNNING", "REVIEW_REQUIRED"])
        .maybeSingle()
      if (active?.source_quotation_updated_at === quotation.updated_at) {
        const runningExpired = runLeaseExpired(active, now().getTime())
        const pendingReviewExpired = reviewExpired(active, now().getTime())
        if (!runningExpired && !pendingReviewExpired) return runView(active)
        if (runningExpired) {
          await deps.db
            .from("quotation_price_refresh_runs")
            .update({
              status: "FAILED",
              error_code: "RUN_LEASE_EXPIRED",
              error_message: "La consulta anterior no terminó y fue cerrada para poder reintentar.",
              completed_at: now().toISOString(),
            })
            .eq("id", active.id)
            .eq("status", "RUNNING")
            .eq("updated_at", active.updated_at)
        } else {
          await deps.db
            .from("quotation_price_refresh_runs")
            .update({
              status: "STALE",
              error_code: "REVIEW_EXPIRED",
              error_message: "La propuesta de precios venció. Se inició una nueva consulta.",
            })
            .eq("id", active.id)
            .eq("status", "REVIEW_REQUIRED")
            .eq("updated_at", active.updated_at)
        }
      }
      if (active && active.source_quotation_updated_at !== quotation.updated_at) {
        await deps.db
          .from("quotation_price_refresh_runs")
          .update({
            status: "STALE",
            error_code: "STALE_QUOTATION",
            error_message: "La cotización cambió después de iniciar la actualización.",
          })
          .eq("id", active.id)
          .in("status", ["RUNNING", "REVIEW_REQUIRED"])
      }

      let credential
      try {
        credential = await resolveCredential({ admin: deps.db, orgId: input.orgId, agencyId: input.agencyId })
      } catch (error) {
        throw new QuotationRefreshError(
          "CREDENTIAL_UNAVAILABLE",
          error instanceof Error ? error.message : "La agencia no tiene una credencial válida de Emilia.",
          error
        )
      }

      const lines = sourceLines(quotation)
      const requestId = `req_${input.idempotencyKey}`
      const runId = uuid()
      const { data: inserted, error: insertError } = await deps.db
        .from("quotation_price_refresh_runs")
        .insert({
          id: runId,
          org_id: input.orgId,
          agency_id: input.agencyId,
          quotation_id: input.quotationId,
          credential_id: credential.id,
          requested_by: input.actorId,
          idempotency_key: input.idempotencyKey,
          remote_request_id: requestId,
          status: "RUNNING",
          source_quotation_updated_at: quotation.updated_at,
          source_active_document_id: quotation.active_document_id || null,
          source_snapshot: { quotation },
        })
        .select("*")
        .single()
      if (insertError || !inserted) {
        if (insertError?.code === "23505") {
          const { data: raced } = await deps.db
            .from("quotation_price_refresh_runs")
            .select("*")
            .eq("org_id", input.orgId)
            .eq("agency_id", input.agencyId)
            .eq("idempotency_key", input.idempotencyKey)
            .maybeSingle()
          if (raced) {
            if (
              raced.quotation_id !== input.quotationId
              || raced.source_quotation_updated_at !== input.expectedUpdatedAt
            ) {
              throw new QuotationRefreshError(
                "IDEMPOTENCY_CONFLICT",
                "La clave de idempotencia ya fue usada para otra actualización."
              )
            }
            return runView(raced)
          }
          const { data: racedActive } = await deps.db
            .from("quotation_price_refresh_runs")
            .select("*")
            .eq("org_id", input.orgId)
            .eq("agency_id", input.agencyId)
            .eq("quotation_id", input.quotationId)
            .in("status", ["RUNNING", "REVIEW_REQUIRED"])
            .maybeSingle()
          if (racedActive?.source_quotation_updated_at === input.expectedUpdatedAt) {
            return runView(racedActive)
          }
        }
        throw mapDatabaseError(insertError, "No se pudo iniciar la actualización.")
      }

      const requestItems = lines.flatMap(line => line.request ? [line.request] : [])
      if (requestItems.length > 0 && deps.offerRefresh.enqueue && deps.offerRefresh.read) {
        try {
          const jobs: Array<Record<string, unknown>> = []
          for (const batch of refreshBatches(requestId, requestItems)) {
            const accepted = await deps.offerRefresh.enqueue({
              apiKey: credential.apiKey,
              requestId: batch.requestId,
              items: batch.items,
            })
            jobs.push({
              job_id: accepted.jobId,
              request_id: accepted.requestId,
              item_ids: batch.items.map(item => item.client_item_id),
              status: accepted.status,
              stage: accepted.stage,
            })
          }
          const { data: queued, error: queueError } = await deps.db
            .from("quotation_price_refresh_runs")
            .update({ remote_jobs: jobs })
            .eq("id", runId)
            .eq("status", "RUNNING")
            .select("*")
            .single()
          if (queueError || !queued) {
            throw mapDatabaseError(queueError, "No se pudo vincular el job de actualización.")
          }
          return runView(queued)
        } catch (error) {
          await deps.db
            .from("quotation_price_refresh_runs")
            .update({
              status: "FAILED",
              error_code: error instanceof Error && "code" in error ? String((error as any).code) : "REMOTE_FAILED",
              error_message: error instanceof Error ? error.message : "No se pudo encolar la actualización de precios.",
              completed_at: now().toISOString(),
            })
            .eq("id", runId)
            .eq("status", "RUNNING")
          if (error instanceof QuotationRefreshError) throw error
          throw new QuotationRefreshError(
            "REMOTE_FAILED",
            error instanceof Error ? error.message : "No se pudo encolar la actualización de precios.",
            error
          )
        }
      }

      try {
        const remote = requestItems.length > 0
          ? await refreshInBatches({ port: deps.offerRefresh, apiKey: credential.apiKey, requestId, items: requestItems })
          : { schema_version: "offer-refresh.v1" as const, request_id: requestId, status: "complete" as const, checked_at: now().toISOString(), items: [] }
        const completed = await completeRunningRun(inserted, quotation, remote)
        return runView(completed)
      } catch (error) {
        await deps.db
          .from("quotation_price_refresh_runs")
          .update({
            status: "FAILED",
            error_code: error instanceof Error && "code" in error ? String((error as any).code) : "REMOTE_FAILED",
            error_message: error instanceof Error ? error.message : "No se pudo consultar el precio actualizado.",
            completed_at: now().toISOString(),
          })
          .eq("id", runId)
          .eq("status", "RUNNING")
        if (error instanceof QuotationRefreshError) throw error
        throw new QuotationRefreshError(
          "REMOTE_FAILED",
          error instanceof Error ? error.message : "No se pudo consultar el precio actualizado.",
          error
        )
      }
    },

    async read(input: QuotationRefreshReadInput): Promise<QuotationRefreshRunView> {
      const run = await loadRun(input)
      const remoteJobs = Array.isArray(run.remote_jobs) ? run.remote_jobs : []
      if (
        run.status === "RUNNING"
        && remoteJobs.length > 0
        && deps.offerRefresh.read
      ) {
        const quotation = run.source_snapshot?.quotation
        if (!quotation || typeof quotation !== "object") {
          throw new QuotationRefreshError("PERSISTENCE_FAILED", "La actualización no conserva su cotización de origen.")
        }
        let credential
        try {
          credential = await resolveCredential({
            admin: deps.db,
            orgId: input.orgId,
            agencyId: input.agencyId,
          })
        } catch (error) {
          throw new QuotationRefreshError(
            "CREDENTIAL_UNAVAILABLE",
            error instanceof Error ? error.message : "La agencia no tiene una credencial válida de Emilia.",
            error
          )
        }
        const requestItems = sourceLines(quotation).flatMap(line => line.request ? [line.request] : [])
        const byId = new Map(requestItems.map(item => [item.client_item_id, item]))
        const snapshots: OfferRefreshJobSnapshot[] = []
        for (const remoteJob of remoteJobs) {
          const batchItems = (Array.isArray(remoteJob.item_ids) ? remoteJob.item_ids : [])
            .map((id: unknown) => typeof id === "string" ? byId.get(id) : undefined)
            .filter((item: OfferRefreshRequestItem | undefined): item is OfferRefreshRequestItem => Boolean(item))
          if (batchItems.length === 0) {
            throw new QuotationRefreshError("PERSISTENCE_FAILED", "El job remoto perdió sus servicios asociados.")
          }
          snapshots.push(await deps.offerRefresh.read({
            apiKey: credential.apiKey,
            jobId: String(remoteJob.job_id),
            requestId: String(remoteJob.request_id),
            items: batchItems,
          }))
        }
        if (snapshots.some(snapshot => snapshot.status === "failed")) {
          const failure = snapshots.find(snapshot => snapshot.status === "failed")
          const { data, error } = await deps.db
            .from("quotation_price_refresh_runs")
            .update({
              status: "FAILED",
              error_code: failure?.error?.code || "REMOTE_FAILED",
              error_message: failure?.error?.message || "Wholesale no pudo actualizar los precios.",
              completed_at: now().toISOString(),
            })
            .eq("id", run.id)
            .eq("status", "RUNNING")
            .select("*")
            .single()
          if (error || !data) throw mapDatabaseError(error, "No se pudo guardar el fallo de actualización.")
          return runView(data)
        }
        if (snapshots.every(snapshot => snapshot.status === "completed")) {
          const remote = combineJobResults(run.remote_request_id, snapshots)
          return runView(await completeRunningRun(run, quotation, remote))
        }
        const nextJobs = remoteJobs.map((remoteJob: Record<string, any>, index: number) => ({
          ...remoteJob,
          status: snapshots[index].status,
          stage: snapshots[index].stage,
        }))
        const { data, error } = await deps.db
          .from("quotation_price_refresh_runs")
          .update({ remote_jobs: nextJobs })
          .eq("id", run.id)
          .eq("status", "RUNNING")
          .select("*")
          .single()
        if (error || !data) throw mapDatabaseError(error, "No se pudo guardar el avance de la actualización.")
        return runView(data)
      }
      const runningExpired = runLeaseExpired(run, now().getTime())
      const pendingReviewExpired = reviewExpired(run, now().getTime())
      if (!runningExpired && !pendingReviewExpired) return runView(run)
      const { data, error } = await deps.db
        .from("quotation_price_refresh_runs")
        .update({
          status: pendingReviewExpired ? "STALE" : "FAILED",
          error_code: pendingReviewExpired ? "REVIEW_EXPIRED" : "RUN_LEASE_EXPIRED",
          error_message: pendingReviewExpired
            ? "La propuesta de precios venció. Volvé a consultarla antes de aplicar."
            : "La consulta no terminó dentro del tiempo permitido. Volvé a intentarlo.",
          ...(runningExpired ? { completed_at: now().toISOString() } : {}),
        })
        .eq("id", input.runId)
        .eq("quotation_id", input.quotationId)
        .eq("org_id", input.orgId)
        .eq("agency_id", input.agencyId)
        .eq("status", run.status)
        .eq("updated_at", run.updated_at)
        .select("*")
        .maybeSingle()
      if (error) throw mapDatabaseError(error, "No se pudo cerrar la consulta vencida.")
      return runView(data || await loadRun(input))
    },

    async apply(input: QuotationRefreshApplyInput): Promise<QuotationRefreshRunView> {
      const run = await loadRun(input)
      if (run.status === "APPLIED") {
        return runView(run)
      }
      if (reviewExpired(run, now().getTime())) {
        await deps.db
          .from("quotation_price_refresh_runs")
          .update({
            status: "STALE",
            error_code: "REVIEW_EXPIRED",
            error_message: "La propuesta de precios venció. Volvé a consultarla antes de aplicar.",
          })
          .eq("id", input.runId)
          .eq("quotation_id", input.quotationId)
          .eq("org_id", input.orgId)
          .eq("agency_id", input.agencyId)
          .eq("status", "REVIEW_REQUIRED")
          .eq("updated_at", run.updated_at)
        throw new QuotationRefreshError("INVALID_STATE", "La propuesta de precios venció. Volvé a consultarla antes de aplicar.")
      }
      if (run.status !== "REVIEW_REQUIRED") {
        throw new QuotationRefreshError("INVALID_STATE", "La actualización ya no está pendiente de revisión.")
      }
      if (run.updated_at !== input.expectedRunUpdatedAt) {
        throw new QuotationRefreshError("RUN_CHANGED", "La propuesta cambió. Recargala antes de aplicar.")
      }
      if (run.source_quotation_updated_at !== input.expectedUpdatedAt) {
        throw new QuotationRefreshError("QUOTATION_CHANGED", "La cotización cambió. Volvé a actualizar los precios.")
      }

      const quotation = await loadQuotation(input)
      if (quotation.updated_at !== input.expectedUpdatedAt) {
        throw new QuotationRefreshError("QUOTATION_CHANGED", "La cotización cambió. Volvé a actualizar los precios.")
      }
      const proposal = run.proposal_snapshot as Record<string, any>
      const proposalItems = Array.isArray(proposal?.items) ? proposal.items as RefreshItemView[] : []
      const remoteItems = Array.isArray(proposal?.remote?.items)
        ? proposal.remote.items as RemoteOfferRefreshItem[]
        : []
      const decisions = new Map(input.decisions.map(decision => [decision.line_id, decision]))
      const optionDecisions = new Map(input.optionDecisions.map(decision => [decision.option_id, decision]))

      if (decisions.size !== input.decisions.length || optionDecisions.size !== input.optionDecisions.length) {
        throw new QuotationRefreshError("INVALID_INPUT", "Las decisiones contienen identificadores duplicados.")
      }
      for (const decision of input.decisions) {
        const item = proposalItems.find(candidate => candidate.line_id === decision.line_id)
        if (!item || !item.allowed_actions.includes(decision.action)) {
          throw new QuotationRefreshError("INVALID_INPUT", "La decisión de un servicio no pertenece a esta propuesta.")
        }
        if (
          decision.action === "USE_REPLACEMENT"
          && !item.candidates?.some(candidate => candidate.id === decision.candidate_id)
        ) {
          throw new QuotationRefreshError("INVALID_INPUT", "Seleccioná una alternativa válida.")
        }
      }
      const summaryOptions = (run.summary?.options || []) as RefreshOptionSummary[]
      for (const decision of input.optionDecisions) {
        if (!summaryOptions.some(option => option.option_id === decision.option_id)) {
          throw new QuotationRefreshError("INVALID_INPUT", "La decisión comercial no pertenece a esta propuesta.")
        }
      }

      for (const item of proposalItems.filter(item => item.requires_decision)) {
        const decision = decisions.get(item.line_id)
        if (!decision || !item.allowed_actions.includes(decision.action)) {
          throw new QuotationRefreshError("INVALID_INPUT", `Falta una decisión válida para ${item.label}.`)
        }
      }
      for (const option of summaryOptions) {
        const decision = optionDecisions.get(option.option_id)
        if (!decision?.confirmed) {
          throw new QuotationRefreshError("INVALID_INPUT", `Falta confirmar el precio comercial de ${option.option_title}.`)
        }
        if (option.manual_total_requires_confirmation && !(Number(decision.sale_total) > 0)) {
          throw new QuotationRefreshError("INVALID_INPUT", `Ingresá el precio al pasajero para ${option.option_title}.`)
        }
      }

      const changesAnItem = input.decisions.some(decision => decision.action !== "KEEP_CURRENT")
      const changesCustomerTotal = summaryOptions.some(option => {
        const saleTotal = optionDecisions.get(option.option_id)?.sale_total
        return saleTotal != null && Number(saleTotal) !== Number(option.current_customer_total)
      })
      if (!changesAnItem && !changesCustomerTotal) {
        const { data, error } = await deps.db.rpc("confirm_quotation_price_refresh", {
          p_run_id: input.runId,
          p_quotation_id: input.quotationId,
          p_org_id: input.orgId,
          p_agency_id: input.agencyId,
          p_actor_id: input.actorId,
          p_expected_quotation_updated_at: input.expectedUpdatedAt,
          p_expected_run_updated_at: input.expectedRunUpdatedAt,
        })
        if (error || !data) throw mapDatabaseError(error, "No se pudo confirmar la actualización de precios.")
        const result = Array.isArray(data) ? data[0] : data
        if (result?.stale === true) {
          throw new QuotationRefreshError("QUOTATION_CHANGED", "La cotización cambió. Volvé a actualizar los precios.")
        }
        if (result?.expired === true) {
          throw new QuotationRefreshError("INVALID_STATE", "La propuesta de precios venció. Volvé a consultarla antes de confirmar.")
        }
        return runView(await loadRun(input))
      }

      const options = Array.isArray(quotation.quotation_options)
        ? [...quotation.quotation_options].sort((a, b) => Number(a.option_number) - Number(b.option_number))
        : []
      const rows = Array.isArray(quotation.quotation_items) ? quotation.quotation_items : []
      const rowsWithoutOperator = rows.filter(row => !row.operator_id)
      if (rowsWithoutOperator.length > 0) {
        throw new QuotationRefreshError(
          "MISSING_OPERATOR",
          "Asigná un operador a todos los servicios desde Cotizaciones antes de aplicar y emitir la nueva versión."
        )
      }
      const rawOptions = options.map(option => {
        const optionDecision = optionDecisions.get(option.id)
        const optionItems = rows.filter(row => row.option_id === option.id).map(row => {
          const decision = decisions.get(row.id)
          if (!decision || decision.action === "KEEP_CURRENT") return row
          const remote = remoteItems.find(item => item.client_item_id === row.id)
          if (!remote) throw new QuotationRefreshError("INVALID_INPUT", "La propuesta remota del servicio ya no está disponible.")

          if (decision.action === "USE_REFRESHED") {
            if (!remote.current?.price) throw new QuotationRefreshError("INVALID_INPUT", "El servicio no tiene un precio actualizado aplicable.")
            if (!exactRefreshMatchesRow(row, remote)) {
              throw new QuotationRefreshError("INVALID_INPUT", "El precio no fue confirmado mediante repricing exacto con el mismo proveedor.")
            }
            if (remote.current.price.currency !== itemCurrency(row, quotation)) {
              throw new QuotationRefreshError("INVALID_INPUT", "El precio actualizado usa otra moneda y requiere conversión explícita.")
            }
            if (remote.current.price.basis !== itemCostBasis(row) || remote.current.price.basis === "UNKNOWN") {
              throw new QuotationRefreshError("INVALID_INPUT", "El precio actualizado no usa la misma base de costo verificable.")
            }
            return {
              ...row,
              ...applyRawCost(row, remote.current.price),
              cost_basis: remote.current.price.basis,
              offer_source: sourceFrom(remote.current.source) || row.offer_source || null,
            }
          }

          const match = /^.+:candidate:(\d+)$/.exec(String(decision.candidate_id || ""))
          const candidate = match ? remote.candidates?.[Number(match[1])] : undefined
          if (!candidate) throw new QuotationRefreshError("INVALID_INPUT", "Seleccioná una alternativa válida.")
          if (candidate.price.currency !== itemCurrency(row, quotation)) {
            throw new QuotationRefreshError("INVALID_INPUT", "La alternativa usa otra moneda y requiere conversión explícita.")
          }
          if (candidate.price.basis !== itemCostBasis(row) || candidate.price.basis === "UNKNOWN") {
            throw new QuotationRefreshError("INVALID_INPUT", "La alternativa no usa la misma base de costo verificable.")
          }
          if (
            !row.operator_id
            || !row.provider
            || String(row.provider).trim().toUpperCase() !== candidate.provider.trim().toUpperCase()
          ) {
            throw new QuotationRefreshError(
              "INVALID_INPUT",
              "El reemplazo requiere seleccionar explícitamente un operador compatible."
            )
          }
          const replacement = replacementRow(row, remote.product, candidate.identity)
          const previousFallback = refreshReferenceFor(row, quotation).fallback
          return {
            ...replacement,
            ...applyRawCost(row, candidate.price),
            cost_basis: candidate.price.basis,
            provider: candidate.provider || row.provider || null,
            offer_source: sourceFrom(candidate.source) || null,
            offer_refresh_fallback: {
              product: remote.product,
              query: previousFallback?.query || {},
              identity: normalizedFallbackIdentity(remote.product, candidate.identity),
            },
          }
        })
        return {
          title: option.title,
          total_amount: optionDecision?.sale_total ?? option.total_amount,
          manual_total_amount: optionDecision?.sale_total ?? option.manual_total_amount,
          items: optionItems,
        }
      })

      let preparedOptions
      try {
        preparedOptions = prepareQuotationOptionsForPersistence(rawOptions, quotation.currency || "USD")
      } catch (error) {
        throw new QuotationRefreshError("INVALID_INPUT", error instanceof Error ? error.message : "La estructura actualizada no es válida.", error)
      }
      const { optionRows, itemRows } = buildQuotationStructureRows({
        quotationId: input.quotationId,
        currency: quotation.currency || "USD",
        preparedOptions,
        orgId: input.orgId,
      })
      const selectedOptionNumber = options.find(option => option.is_selected === true)?.option_number
      if (selectedOptionNumber != null) {
        for (const optionRow of optionRows) {
          optionRow.is_selected = optionRow.option_number === selectedOptionNumber
        }
      }
      const stagedQuotation = {
        ...quotation,
        quotation_options: optionRows,
        quotation_items: itemRows,
        subtotal: optionRows[0]?.total_amount || 0,
        total_amount: optionRows[0]?.total_amount || 0,
        active_document_id: null,
      }
      const document = await prepareDocument({ supabase: deps.db, quotation: stagedQuotation })
      const { data, error } = await deps.db.rpc("apply_quotation_price_refresh", {
        p_run_id: input.runId,
        p_quotation_id: input.quotationId,
        p_org_id: input.orgId,
        p_agency_id: input.agencyId,
        p_actor_id: input.actorId,
        p_expected_quotation_updated_at: input.expectedUpdatedAt,
        p_expected_run_updated_at: input.expectedRunUpdatedAt,
        p_options: optionRows,
        p_items: itemRows,
        p_revision_id: document.revisionId,
        p_data_snapshot: document.model,
        p_manifest_snapshot: document.manifest,
        p_html_snapshot: document.html,
        p_content_hash: document.contentHash,
        p_file_name: document.filename,
      })
      if (error || !data) throw mapDatabaseError(error, "No se pudo aplicar la actualización de precios.")
      const result = Array.isArray(data) ? data[0] : data
      if (result?.stale === true) {
        throw new QuotationRefreshError("QUOTATION_CHANGED", "La cotización cambió. Volvé a actualizar los precios.")
      }
      if (result?.expired === true) {
        throw new QuotationRefreshError("INVALID_STATE", "La propuesta de precios venció. Volvé a consultarla antes de aplicar.")
      }
      return runView(await loadRun(input))
    },

    async discard(input: QuotationRefreshDiscardInput): Promise<QuotationRefreshRunView> {
      await loadQuotation(input)
      const run = await loadRun(input)
      if (run.status === "STALE" && run.error_code === "REVIEW_DISCARDED") return runView(run)
      if (run.status !== "REVIEW_REQUIRED") {
        throw new QuotationRefreshError("INVALID_STATE", "La propuesta ya no está pendiente de revisión.")
      }
      if (run.updated_at !== input.expectedRunUpdatedAt) {
        throw new QuotationRefreshError("RUN_CHANGED", "La propuesta cambió. Recargala antes de descartarla.")
      }
      const { data, error } = await deps.db
        .from("quotation_price_refresh_runs")
        .update({
          status: "STALE",
          error_code: "REVIEW_DISCARDED",
          error_message: "La propuesta fue descartada para volver a consultar precios.",
        })
        .eq("id", input.runId)
        .eq("quotation_id", input.quotationId)
        .eq("org_id", input.orgId)
        .eq("agency_id", input.agencyId)
        .eq("status", "REVIEW_REQUIRED")
        .eq("updated_at", input.expectedRunUpdatedAt)
        .select("*")
        .maybeSingle()
      if (error) throw mapDatabaseError(error, "No se pudo descartar la propuesta.")
      if (!data) throw new QuotationRefreshError("RUN_CHANGED", "La propuesta cambió. Recargala antes de descartarla.")
      return runView(data)
    },
  }
}
