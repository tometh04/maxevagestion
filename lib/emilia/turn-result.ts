import { buildAssistantContent, generateClientId, generateTitle } from "@/lib/emilia/utils"
import type { EmiliaProgressView } from "./progressive-turn"
import { z } from "zod"
import { hotelQueryForOffer, parseHotelSegments } from "./hotel-stays"
import {
  sanitizeEmiliaMetaForStorage,
  transformCanonicalFlights,
  transformCanonicalHotels,
  transformFlights,
  transformHotels,
} from "@/lib/emilia/transformers"

interface PersistTurnResultInput {
  supabase: any
  conversation: any
  conversationId: string
  orgId: string
  userId: string
  requestId: string
  data: any
  jobId?: string
}

function isDuplicate(error: any) {
  return error?.code === "23505" || error?.message?.includes("duplicate") || error?.message?.includes("unique")
}

const progressSchema = z.object({
  version: z.number().int().positive(),
  attempt: z.number().int().positive(),
  requested_products: z.array(z.enum(["flights", "hotels"])).min(1).max(2),
  results: z.object({ result_sets: z.array(z.object({
    product: z.enum(["flights", "hotels"]),
    status: z.enum(["available", "empty", "failed"]),
    data: z.array(z.unknown()),
  }).passthrough()) }).passthrough(),
})

/** Public snapshots use exactly the same card and price normalization as final turns. */
export function normalizeEmiliaProgress(data: any) {
  const parsed = progressSchema.safeParse(data?.progress)
  if (!parsed.success || parsed.data.attempt !== data.attempt) return undefined
  const snapshot = parsed.data
  const turn = {
    schema_version: "emilia.turn.v1",
    metadata: { turn_id: `turn_${data.job_id}` },
    outcome: { type: "search_results", results: snapshot.results },
  }
  const normalized = normalizeCanonicalTurn(turn)
  const products: EmiliaProgressView["products"] = {}
  for (const product of snapshot.requested_products) {
    const set = snapshot.results.result_sets.find(set => set.product === product)
    products[product] = set?.status || "searching"
  }
  return {
    progress: { version: snapshot.version, attempt: snapshot.attempt, products },
    results: { flights: normalized.flights, hotels: normalized.hotels },
    requestType: snapshot.requested_products.length === 2 ? "combined" : snapshot.requested_products[0],
    assistant_message: { meta: normalized.assistantMeta },
  }
}

interface NormalizedEmiliaTurn {
  status: string
  message?: string
  missingFields: string[]
  suggestedFollowups: string[]
  flights?: { count: number; items: any[] }
  hotels?: { count: number; items: any[] }
  requestType?: string
  parsedRequest: any
  assistantText?: string
  assistantMeta: any
  searchId?: string
}

function assistantMessageText(message: any): string | undefined {
  if (typeof message?.content === "string") return message.content
  return typeof message?.content?.text === "string" ? message.content.text : undefined
}

function canonicalResultSets(data: any): any[] | null {
  const outcome = data?.outcome
  if (data?.schema_version !== "emilia.turn.v1" || !outcome) return null
  if (!["search_results", "no_results", "recovery"].includes(outcome.type)) return []
  return Array.isArray(outcome?.results?.result_sets) ? outcome.results.result_sets : []
}

function canonicalResultSet(data: any, product: "flights" | "hotels") {
  const resultSets = data?.outcome?.results?.result_sets
  if (!Array.isArray(resultSets)) return null
  return resultSets.find((entry: any) => entry?.product === product && Array.isArray(entry?.data)) || null
}

function validCanonicalMoney(value: any) {
  return Number.isFinite(Number(value?.amount))
    && Number(value.amount) > 0
    && typeof value?.currency === "string"
    && /^[A-Z]{3}$/.test(value.currency)
}

function canonicalCostBasis(value: any) {
  const basis = value?.basis ?? value?.cost_basis ?? value?.costBasis
  return ["AGENCY_NET", "PROVIDER_TOTAL", "COMMISSIONABLE_GROSS"].includes(String(basis))
    ? basis as "AGENCY_NET" | "PROVIDER_TOTAL" | "COMMISSIONABLE_GROSS"
    : "UNKNOWN" as const
}

function pointTimestamp(point: any) {
  if (!point || typeof point !== "object") return null
  if (typeof point.date === "string" && typeof point.time === "string") {
    return `${point.date}T${point.time}`
  }
  return typeof point.date === "string" ? point.date : null
}

function canonicalDatePart(value: unknown) {
  return typeof value === "string" && value ? value.slice(0, 10) : null
}

/** Añade al view model de cards la procedencia pública necesaria para refrescar
 * una oferta, sin volver a pasar el contrato canónico por transformers legacy. */
export function canonicalOfferCards(data: any) {
  const flightSet = canonicalResultSet(data, "flights")
  const hotelSet = canonicalResultSet(data, "hotels")
  const flightQuery = flightSet?.query && typeof flightSet.query === "object" ? flightSet.query : {}
  const hotelQuery = hotelSet?.query && typeof hotelSet.query === "object" ? hotelSet.query : {}
  const flightArtifact = typeof flightSet?.artifact_id === "string" && flightSet.artifact_id.trim()
    ? flightSet.artifact_id.trim()
    : null
  const hotelArtifact = typeof hotelSet?.artifact_id === "string" && hotelSet.artifact_id.trim()
    ? hotelSet.artifact_id.trim()
    : null

  const rawFlights = flightSet
    ? flightSet.data.filter((flight: any) => validCanonicalMoney(flight?.price))
    : undefined
  const transformedFlights = rawFlights
    ? transformCanonicalFlights(rawFlights, flightQuery)
    : undefined
  const flights = transformedFlights?.map((flight: any, index: number) => {
    const rawFlight = rawFlights?.[index]
    const rawLegs = Array.isArray(rawFlight?.legs) ? rawFlight.legs : []
    const firstDeparture = rawLegs[0]?.departure_at || rawLegs[0]?.segments?.[0]?.departure?.date
    const secondDeparture = rawLegs[1]?.departure_at || rawLegs[1]?.segments?.[0]?.departure?.date

    return {
      ...flight,
      price: {
        ...flight.price,
        cost_basis: canonicalCostBasis(rawFlight?.price),
      },
      departure_date: canonicalDatePart(
        flightQuery.departure_date ?? flightQuery.departureDate ?? firstDeparture
      ) || flight.departure_date,
      return_date: canonicalDatePart(
        flightQuery.return_date ?? flightQuery.returnDate ?? secondDeparture
      ) ?? flight.return_date,
      baggage: rawFlight?.baggage ?? null,
      refundable: rawFlight?.refundable ?? null,
      legs: flight.legs.map((leg: any, legIndex: number) => ({
        ...leg,
        baggage: rawFlight?.baggage ?? null,
        segments: Array.isArray(rawLegs[legIndex]?.segments) ? rawLegs[legIndex].segments : [],
      })),
      offer_source: flightArtifact && typeof rawFlight?.id === "string" && rawFlight.id.trim()
        ? {
            artifact_id: flightArtifact,
            product: "flights" as const,
            offer_id: rawFlight.id,
          }
        : undefined,
      offer_refresh_fallback: {
        product: "flights" as const,
        query: flightQuery,
        identity: {
          kind: "flight",
          segments: rawLegs.flatMap((leg: any) => (
            Array.isArray(leg?.segments) ? leg.segments : []
          ).map((segment: any) => ({
            marketing_airline: segment?.marketing_airline ?? null,
            flight_number: segment?.flight_number ?? null,
            origin: segment?.departure?.airport_code,
            destination: segment?.arrival?.airport_code,
            departure_at: pointTimestamp(segment?.departure),
          }))),
          cabin: rawFlight?.cabin ?? null,
          checked_baggage: rawFlight?.baggage?.checked ?? null,
          carry_on: rawFlight?.baggage?.carry_on ?? null,
          refundable: rawFlight?.refundable ?? null,
        },
      },
    }
  })

  const rawHotels = hotelSet
    ? hotelSet.data.flatMap((hotel: any) => {
        const rooms = (Array.isArray(hotel?.rooms) ? hotel.rooms : [])
          .filter((room: any) => validCanonicalMoney(room?.price))
        return rooms.length > 0 ? [{ ...hotel, rooms }] : []
      })
    : undefined
  const transformedHotels = rawHotels
    ? transformCanonicalHotels(rawHotels, hotelQuery)
    : undefined
  const hotels = transformedHotels?.map((hotel: any, index: number) => {
    const rawHotel = rawHotels?.[index]
    const rawRooms = Array.isArray(rawHotel?.rooms) ? rawHotel.rooms : []
    return {
      ...hotel,
      rooms: hotel.rooms.map((room: any, roomIndex: number) => {
        const rawRoom = rawRooms[roomIndex]
        return {
          ...room,
          id: rawRoom?.id,
          cost_basis: canonicalCostBasis(rawRoom?.price),
          offer_source:
            hotelArtifact && typeof rawHotel?.id === "string" && rawHotel.id.trim()
              ? {
                  artifact_id: hotelArtifact,
                  product: "hotels" as const,
                  offer_id: rawHotel.id,
                  ...(typeof rawRoom?.id === "string" && rawRoom.id.trim()
                    ? { selection_id: rawRoom.id }
                    : {}),
                }
              : undefined,
          offer_refresh_fallback: {
            product: "hotels" as const,
            query: hotelQueryForOffer(hotelQuery, hotel.search_context),
            identity: {
              kind: "hotel_room",
              hotel_name: rawHotel?.name,
              city: rawHotel?.location?.city ?? null,
              room_name: rawRoom?.name ?? null,
              board: rawRoom?.board ?? null,
              check_in: hotel.check_in,
              check_out: hotel.check_out,
            },
          },
        }
      }),
    }
  })

  return { flights, hotels }
}

function canonicalRequestType(flights: any, hotels: any): string | undefined {
  if (flights && hotels) return "combined"
  if (flights) return "flights"
  if (hotels) return "hotels"
  return undefined
}

function quotationSummary(value: unknown) {
  const parsed = z.object({
    id: z.string(), revision_id: z.string(), version: z.number().int().positive(),
    items: z.array(z.object({
      product: z.enum(["flights", "hotels"]), offer_id: z.string(),
      offer: z.object({
        name: z.string().optional(),
        location: z.object({ city: z.string().nullable() }).optional(),
        stay: z.object({ check_in: z.string().nullable(), check_out: z.string().nullable() }).optional(),
        legs: z.array(z.object({ origin: z.string().nullable(), destination: z.string().nullable() })).optional(),
      }),
    })).max(7),
  }).safeParse(value)
  if (!parsed.success) return undefined
  return {
    id: parsed.data.id, revisionId: parsed.data.revision_id, version: parsed.data.version,
    items: parsed.data.items.map(item => ({
      id: item.offer_id,
      label: item.product === "flights"
        ? `Vuelo ${item.offer.legs?.[0]?.origin || ""} → ${item.offer.legs?.[0]?.destination || ""}`
        : [item.offer.name, item.offer.location?.city, item.offer.stay?.check_in, item.offer.stay?.check_out].filter(Boolean).join(" · "),
    })),
  }
}

function normalizeCanonicalTurn(data: any): NormalizedEmiliaTurn {
  const outcome = data.outcome || {}
  const text = assistantMessageText(data.assistant_message)

  if (outcome.type === "needs_input") {
    return {
      status: "incomplete",
      message: outcome.question || text || "Necesito más información para completar la búsqueda.",
      missingFields: Array.isArray(outcome.missing_fields) ? outcome.missing_fields : [],
      suggestedFollowups: [],
      parsedRequest: null,
      assistantText: text,
      assistantMeta: {
        messageType: "needs_input",
        missing_fields: Array.isArray(outcome.missing_fields) ? outcome.missing_fields : [],
      },
    }
  }

  if (outcome.type === "error") {
    return {
      status: "error",
      message: outcome?.error?.message || text || "Emilia no pudo completar la búsqueda.",
      missingFields: [],
      suggestedFollowups: [],
      parsedRequest: null,
      assistantText: text,
      assistantMeta: { messageType: "error" },
    }
  }

  const resultSets = canonicalResultSets(data) || []
  const flightSet = resultSets.find((resultSet) => resultSet?.product === "flights")
  const hotelSet = resultSets.find((resultSet) => resultSet?.product === "hotels")
  const canonicalCards = canonicalOfferCards(data)
  const flightItems = canonicalCards.flights
  const hotelItems = canonicalCards.hotels
  const requestType = canonicalRequestType(flightSet, hotelSet)
  const parsedRequest = requestType
    ? {
      type: requestType,
      requestType,
      ...(flightSet ? { flights: flightSet.query || {} } : {}),
      ...(hotelSet ? { hotels: hotelSet.query || {} } : {}),
    }
    : null
  const searchContextId = data?.metadata?.turn_id || data?.metadata?.job_id || data?.request_id
  const turnSemantics = {
    ...(data?.metadata?.turn_relation ? { relation: data.metadata.turn_relation } : {}),
    ...(searchContextId && outcome.type !== "quotation_updated" ? { searchContextId } : {}),
  }

  return {
    status: "completed",
    message: text,
    missingFields: [],
    suggestedFollowups: [],
    flights: flightSet ? { count: flightItems?.length || 0, items: flightItems || [] } : undefined,
    hotels: hotelSet ? { count: hotelItems?.length || 0, items: hotelItems || [] } : undefined,
    requestType,
    parsedRequest,
    assistantText: text,
    assistantMeta: {
      messageType: outcome.type || "message",
      productStates: Object.fromEntries(resultSets.map(set => [set.product, set.status])),
      hotelSegments: parseHotelSegments(hotelSet?.metadata),
      ...(outcome.type === "quotation_updated" ? { quotation: quotationSummary(outcome.quotation) } : {}),
      ...(parsedRequest ? { originalRequest: parsedRequest, parsedRequest } : {}),
      ...(Object.keys(turnSemantics).length > 0 ? { turnSemantics } : {}),
      canonicalResult: outcome.results
        ? {
          status: outcome.results.status,
          warnings: outcome.results.warnings || [],
          availableActions: outcome.results.available_actions || [],
          references: outcome.results.references || [],
        }
        : undefined,
    },
  }
}

/** Adapta el contrato público de Emilia y el shape histórico al único view model de Maxeva. */
export function normalizeEmiliaTurnPayload(data: any): NormalizedEmiliaTurn {
  if (data?.schema_version === "emilia.turn.v1" && data?.outcome) {
    return normalizeCanonicalTurn(data)
  }

  const metaCombined = data?.assistant_message?.meta?.combinedData
  const flightsRaw = metaCombined?.flights ?? data?.results?.flights ?? data?.flights
  const hotelsRaw = metaCombined?.hotels ?? data?.results?.hotels ?? data?.hotels
  const flightsData = Array.isArray(flightsRaw)
    ? { count: flightsRaw.length, items: flightsRaw }
    : flightsRaw
  const hotelsData = Array.isArray(hotelsRaw)
    ? { count: hotelsRaw.length, items: hotelsRaw }
    : hotelsRaw
  const transformedFlights = flightsData?.items ? transformFlights(flightsData.items) : undefined
  const transformedHotels = hotelsData?.items ? transformHotels(hotelsData.items) : undefined
  const flights = transformedFlights
    ? { count: transformedFlights.length, items: transformedFlights }
    : flightsData
  const hotels = transformedHotels
    ? { count: transformedHotels.length, items: transformedHotels }
    : hotelsData
  const parsedRequest =
    data?.parsed_request ??
    data?.emilia?.parsed_request ??
    data?.assistant_message?.meta?.parsedRequest ??
    null
  const parsedRequestType = parsedRequest?.requestType
  const requestType = flights && hotels ? "combined"
    : flights ? "flights-only"
      : hotels ? "hotels-only"
        : parsedRequestType === "flights" ? "flights-only"
          : parsedRequestType === "hotels" ? "hotels-only"
            : parsedRequestType === "combined" ? "combined"
              : data?.requestType

  return {
    status: data?.status || "completed",
    message: data?.message,
    missingFields: data?.missing_fields || [],
    suggestedFollowups: data?.suggested_followups || [],
    flights,
    hotels,
    requestType,
    parsedRequest,
    assistantText: assistantMessageText(data?.assistant_message),
    assistantMeta: data?.assistant_message?.meta,
    searchId: data?.search_id,
  }
}

export async function persistEmiliaTurnResult({
  supabase,
  conversation,
  conversationId,
  orgId,
  userId,
  requestId,
  data,
  jobId,
}: PersistTurnResultInput) {
  const assistantClientId = jobId || generateClientId()
  const normalized = normalizeEmiliaTurnPayload(data)

  if (normalized.status === "incomplete" || data.request_type === "missing_info_request") {
    const assistantContent = {
      text: normalized.message || "Necesito más información para completar la búsqueda. ¿Podrías especificar las fechas, cantidad de personas y destino?",
      metadata: {
        request_type: "missing_info_request",
        missing_fields: normalized.missingFields,
        suggested_followups: normalized.suggestedFollowups,
        emilia_job: jobId ? { job_id: jobId, request_id: requestId, status: "completed" } : undefined,
      },
    }

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: assistantContent,
      client_id: assistantClientId,
      api_request_id: requestId,
      api_search_id: normalized.searchId,
    })
    if (error && !isDuplicate(error)) throw error

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("org_id", orgId)
      .eq("user_id", userId)

    return {
      status: "incomplete",
      message: assistantContent.text,
      missing_fields: normalized.missingFields,
      suggested_followups: normalized.suggestedFollowups,
      job_id: jobId,
      timestamp: new Date().toISOString(),
    }
  }

  const resultsFlights = normalized.flights
  const resultsHotels = normalized.hotels
  const derivedRequestType = normalized.requestType

  const normalizedDataForContent = {
    ...data,
    status: normalized.status,
    results: resultsFlights || resultsHotels
      ? { flights: resultsFlights, hotels: resultsHotels }
      : data.results,
  }
  const emiliaText = normalized.assistantText || normalized.message
  const emiliaMeta = sanitizeEmiliaMetaForStorage(normalized.assistantMeta)
  const assistantContent = {
    text: emiliaText || buildAssistantContent(normalizedDataForContent),
    cards: resultsFlights || resultsHotels
      ? { flights: resultsFlights, hotels: resultsHotels, requestType: derivedRequestType }
      : undefined,
    metadata: {
      search_id: normalized.searchId,
      results_count: (resultsFlights?.count || 0) + (resultsHotels?.count || 0),
      emilia_meta: emiliaMeta,
      emilia_job: jobId ? { job_id: jobId, request_id: requestId, status: "completed" } : undefined,
    },
  }

  const { error: assistantError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: assistantContent,
    client_id: assistantClientId,
    api_request_id: requestId,
    api_search_id: normalized.searchId,
  })
  if (assistantError && !isDuplicate(assistantError)) throw assistantError

  const updates: any = { last_message_at: new Date().toISOString() }
  const parsedRequestForCtx = normalized.parsedRequest
  if (data.context_management?.action === "save" && data.context_management?.context_to_save) {
    updates.last_search_context = data.context_management.context_to_save
  } else if (parsedRequestForCtx) {
    updates.last_search_context = parsedRequestForCtx
  }
  if (conversation.title?.startsWith("Chat ") && normalized.status === "completed" && parsedRequestForCtx) {
    updates.title = generateTitle(parsedRequestForCtx)
  }

  await supabase
    .from("conversations")
    .update(updates)
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .eq("user_id", userId)

  const normalizedResults = resultsFlights || resultsHotels
    ? { flights: resultsFlights, hotels: resultsHotels }
    : data.results

  const normalizedAssistantMessage = (data.assistant_message || emiliaText)
    ? {
      ...(data.assistant_message || { role: "assistant" }),
      content: { text: assistantContent.text },
      meta: emiliaMeta,
    }
    : data.assistant_message

  return {
    ...data,
    assistant_message: normalizedAssistantMessage,
    status: normalized.status,
    results: normalizedResults,
    requestType: derivedRequestType,
    job_id: jobId,
    timestamp: new Date().toISOString(),
    conversationTitle: updates.title || conversation.title,
  }
}

export async function persistEmiliaTurnFailure({
  supabase,
  conversationId,
  requestId,
  jobId,
  message,
  data,
}: {
  supabase: any
  conversationId: string
  requestId: string
  jobId: string
  message: string
  data?: any
}) {
  const preview = data ? normalizeEmiliaProgress(data) : undefined
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: {
      text: message,
      ...(preview ? { cards: { ...preview.results, requestType: preview.requestType } } : {}),
      metadata: {
        emilia_job: { job_id: jobId, request_id: requestId, status: "failed" },
        ...(preview ? { emilia_meta: preview.assistant_message.meta, progress: preview.progress } : {}),
      },
    },
    client_id: jobId,
    api_request_id: requestId,
  })
  if (error && !isDuplicate(error)) throw error
}
