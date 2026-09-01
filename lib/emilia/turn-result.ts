import { buildAssistantContent, generateClientId, generateTitle } from "@/lib/emilia/utils"
import { sanitizeEmiliaMetaForStorage, transformFlights, transformHotels } from "@/lib/emilia/transformers"

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

function canonicalResultSet(data: any, product: "flights" | "hotels") {
  const sets = data?.outcome?.results?.result_sets
  if (!Array.isArray(sets)) return null
  const set = sets.find((entry: any) => entry?.product === product && Array.isArray(entry?.data))
  return set || null
}

function datePart(value: unknown) {
  return typeof value === "string" && value ? value.slice(0, 10) : null
}

function durationLabel(minutes: unknown) {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) return ""
  const hours = Math.floor(value / 60)
  const rest = Math.round(value % 60)
  return `${hours ? `${hours}h ` : ""}${rest ? `${rest}m` : ""}`.trim()
}

function validMoney(value: any) {
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

function waitingLabel(arrival: any, departure: any) {
  const arrivalAt = pointTimestamp(arrival)
  const departureAt = pointTimestamp(departure)
  if (!arrivalAt || !departureAt) return ""
  const minutes = Math.round((Date.parse(departureAt) - Date.parse(arrivalAt)) / 60_000)
  return minutes > 0 ? durationLabel(minutes) : ""
}

/** Proyecta el contrato publico emilia.turn.v1 al shape de cards, sin volver a
 * pasarlo por transformers legacy (sus legs/rooms tienen otra estructura). */
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
  return {
    flights: flightSet?.data?.flatMap((flight: any) => {
      if (!validMoney(flight?.price)) return []
      const legs = Array.isArray(flight?.legs) ? flight.legs : []
      const firstDeparture = legs[0]?.departure_at || legs[0]?.segments?.[0]?.departure?.date
      const secondDeparture = legs[1]?.departure_at || legs[1]?.segments?.[0]?.departure?.date
      return [{
        id: flight.id,
        airline: {
          code: flight.airline?.code || "",
          name: flight.airline?.name || flight.airline?.code || "",
        },
        provider: flight.provider ?? null,
        price: {
          amount: Number(flight.price?.amount ?? 0),
          currency: flight.price?.currency || "USD",
          basis: "GROUP_TOTAL" as const,
          cost_basis: canonicalCostBasis(flight.price),
        },
        adults: Number(flightQuery.adults ?? flightQuery.passengers?.adults ?? 1),
        children: Number(flightQuery.children ?? flightQuery.passengers?.children ?? 0),
        childrens: Number(flightQuery.children ?? flightQuery.passengers?.children ?? 0),
        departure_date: datePart(flightQuery.departure_date ?? flightQuery.departureDate ?? firstDeparture) || "",
        return_date: datePart(flightQuery.return_date ?? flightQuery.returnDate ?? secondDeparture),
        cabin_class: flight.cabin ?? null,
        legs: legs.map((leg: any, index: number) => {
          const segments = Array.isArray(leg.segments) ? leg.segments : []
          const first = segments[0]
          const last = segments[segments.length - 1]
          return {
            departure: {
              city_code: leg.origin || first?.departure?.airport_code || "",
              city_name: first?.departure?.city || leg.origin || "",
              time: first?.departure?.time || leg.departure_at || "",
            },
            arrival: {
              city_code: leg.destination || last?.arrival?.airport_code || "",
              city_name: last?.arrival?.city || leg.destination || "",
              time: last?.arrival?.time || leg.arrival_at || "",
            },
            duration: durationLabel(leg.duration_minutes),
            flight_type: index === 0 ? "outbound" as const : "inbound" as const,
            layovers: segments.slice(0, -1).map((segment: any) => ({
              destination_city: segment.arrival?.city || segment.arrival?.airport_code || "",
              destination_code: segment.arrival?.airport_code || "",
              waiting_time: waitingLabel(segment.arrival, segments[segments.indexOf(segment) + 1]?.departure),
            })),
            arrival_next_day: Boolean(
              first?.departure?.date
              && last?.arrival?.date
              && last.arrival.date > first.departure.date
            ),
            baggage: flight.baggage,
            segments,
          }
        }),
        baggage: flight.baggage,
        refundable: flight.refundable,
        offer_source: flightArtifact && typeof flight?.id === "string" && flight.id.trim()
        ? {
            artifact_id: flightArtifact,
            product: "flights" as const,
            offer_id: flight.id,
          }
        : undefined,
        offer_refresh_fallback: {
          product: "flights" as const,
          query: flightQuery,
          identity: {
            kind: "flight",
            segments: legs.flatMap((leg: any) => (Array.isArray(leg.segments) ? leg.segments : []).map((segment: any) => ({
              marketing_airline: segment.marketing_airline ?? null,
              flight_number: segment.flight_number ?? null,
              origin: segment.departure?.airport_code,
              destination: segment.arrival?.airport_code,
              departure_at: pointTimestamp(segment.departure),
            }))),
            cabin: flight.cabin ?? null,
            checked_baggage: flight.baggage?.checked ?? null,
            carry_on: flight.baggage?.carry_on ?? null,
            refundable: flight.refundable ?? null,
          },
        },
      }]
    }),
    hotels: hotelSet?.data?.flatMap((hotel: any) => {
      const rooms = (Array.isArray(hotel?.rooms) ? hotel.rooms : []).filter((room: any) => validMoney(room?.price))
      if (rooms.length === 0) return []
      const checkIn = hotel.stay?.check_in || hotelQuery.check_in || hotelQuery.checkIn || hotelQuery.checkinDate || ""
      const checkOut = hotel.stay?.check_out || hotelQuery.check_out || hotelQuery.checkOut || hotelQuery.checkoutDate || ""
      const derivedNights = checkIn && checkOut
        ? Math.max(0, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000))
        : 0
      const nights = Number(hotel.stay?.nights ?? derivedNights)
      return [{
      id: hotel.id,
      unique_id: hotel.id,
      name: hotel.name,
      category: hotel.stars ? `${hotel.stars} estrellas` : "",
      city: hotel.location?.city || "",
      address: hotel.location?.address || "",
      phone: "",
      images: [],
      check_in: checkIn,
      check_out: checkOut,
      nights,
      rooms: rooms.map((room: any) => ({
            id: room.id,
            type: room.name || "Habitación",
            description: [room.name, room.board].filter(Boolean).join(" · "),
            price_per_night: Number(room.price.amount) / Math.max(1, nights),
            total_price: Number(room.price?.amount ?? 0),
            currency: room.price?.currency || hotel.minimum_price?.currency || "USD",
            cost_basis: canonicalCostBasis(room.price),
            availability: 2,
            occupancy_id: room.id,
            adults: Number(hotelQuery.adults ?? hotelQuery.occupancies?.[0]?.adults ?? 1),
            children: Number(hotelQuery.children ?? hotelQuery.occupancies?.[0]?.children ?? 0),
            refundable: room.refundable,
            policy_cancellation: room.cancellation_policy,
            offer_source:
              hotelArtifact && typeof hotel?.id === "string" && hotel.id.trim()
                ? {
                    artifact_id: hotelArtifact,
                    product: "hotels" as const,
                    offer_id: hotel.id,
                    ...(typeof room?.id === "string" && room.id.trim()
                      ? { selection_id: room.id }
                      : {}),
                  }
                : undefined,
            offer_refresh_fallback: {
              product: "hotels" as const,
              query: hotelQuery,
              identity: {
                kind: "hotel_room",
                hotel_name: hotel.name,
                city: hotel.location?.city ?? null,
                room_name: room.name ?? null,
                board: room.board ?? null,
                check_in: checkIn,
                check_out: checkOut,
              },
            },
          })),
      policy_cancellation: rooms[0]?.cancellation_policy || "",
      policy_lodging: "",
      search_adults: Number(hotelQuery.adults ?? hotelQuery.occupancies?.[0]?.adults ?? 1),
      search_children: Number(hotelQuery.children ?? hotelQuery.occupancies?.[0]?.children ?? 0),
      provider: hotel.provider ?? null,
    }]
    }),
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

  if (data.status === "incomplete" || data.request_type === "missing_info_request") {
    const assistantContent = {
      text: data.message || "Necesito más información para completar la búsqueda. ¿Podrías especificar las fechas, cantidad de personas y destino?",
      metadata: {
        request_type: "missing_info_request",
        missing_fields: data.missing_fields || [],
        suggested_followups: data.suggested_followups || [],
        emilia_job: jobId ? { job_id: jobId, request_id: requestId, status: "completed" } : undefined,
      },
    }

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: assistantContent,
      client_id: assistantClientId,
      api_request_id: requestId,
      api_search_id: data.search_id,
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
      missing_fields: data.missing_fields || [],
      suggested_followups: data.suggested_followups || [],
      job_id: jobId,
      timestamp: new Date().toISOString(),
    }
  }

  const metaCombined = data.assistant_message?.meta?.combinedData
  const canonical = canonicalOfferCards(data)
  const hasCanonicalFlights = canonical.flights !== undefined
  const hasCanonicalHotels = canonical.hotels !== undefined
  const flightsRaw = canonical.flights ?? metaCombined?.flights ?? data.results?.flights ?? data.flights
  const hotelsRaw = canonical.hotels ?? metaCombined?.hotels ?? data.results?.hotels ?? data.hotels
  const flightsData = Array.isArray(flightsRaw)
    ? { count: flightsRaw.length, items: flightsRaw }
    : flightsRaw
  const hotelsData = Array.isArray(hotelsRaw)
    ? { count: hotelsRaw.length, items: hotelsRaw }
    : hotelsRaw
  const transformedFlights = flightsData?.items
    ? hasCanonicalFlights ? flightsData.items : transformFlights(flightsData.items)
    : undefined
  const transformedHotels = hotelsData?.items
    ? hasCanonicalHotels ? hotelsData.items : transformHotels(hotelsData.items)
    : undefined
  const resultsFlights = transformedFlights
    ? { count: flightsData.count, items: transformedFlights }
    : flightsData
  const resultsHotels = transformedHotels
    ? { count: hotelsData.count, items: transformedHotels }
    : hotelsData

  const parsedReqType =
    data.assistant_message?.meta?.parsedRequest?.requestType ??
    data.emilia?.parsed_request?.requestType ??
    data.parsed_request?.requestType
  const derivedRequestType =
    resultsFlights && resultsHotels ? "combined"
      : resultsFlights ? "flights-only"
        : resultsHotels ? "hotels-only"
          : parsedReqType === "flights" ? "flights-only"
            : parsedReqType === "hotels" ? "hotels-only"
              : parsedReqType === "combined" ? "combined"
                : data.requestType

  const normalizedDataForContent = {
    ...data,
    results: resultsFlights || resultsHotels
      ? { flights: resultsFlights, hotels: resultsHotels }
      : data.results,
  }
  const emiliaText = data.assistant_message?.content?.text as string | undefined
  const emiliaMeta = sanitizeEmiliaMetaForStorage(data.assistant_message?.meta)
  const assistantContent = {
    text: emiliaText || buildAssistantContent(normalizedDataForContent),
    cards: resultsFlights || resultsHotels
      ? { flights: resultsFlights, hotels: resultsHotels, requestType: derivedRequestType }
      : undefined,
    metadata: {
      search_id: data.search_id,
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
    api_search_id: data.search_id,
  })
  if (assistantError && !isDuplicate(assistantError)) throw assistantError

  const updates: any = { last_message_at: new Date().toISOString() }
  const parsedRequestForCtx =
    data.parsed_request ??
    data.emilia?.parsed_request ??
    data.assistant_message?.meta?.parsedRequest ??
    null
  if (data.context_management?.action === "save" && data.context_management?.context_to_save) {
    updates.last_search_context = data.context_management.context_to_save
  } else if (parsedRequestForCtx) {
    updates.last_search_context = parsedRequestForCtx
  }
  if (conversation.title?.startsWith("Chat ") && data.status === "completed" && parsedRequestForCtx) {
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
    : data.results || (flightsData || hotelsData
      ? { flights: resultsFlights, hotels: resultsHotels }
      : undefined)

  return {
    ...data,
    assistant_message: data.assistant_message
      ? { ...data.assistant_message, meta: emiliaMeta }
      : data.assistant_message,
    status: data.status || "completed",
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
}: {
  supabase: any
  conversationId: string
  requestId: string
  jobId: string
  message: string
}) {
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: {
      text: message,
      metadata: { emilia_job: { job_id: jobId, request_id: requestId, status: "failed" } },
    },
    client_id: jobId,
    api_request_id: requestId,
  })
  if (error && !isDuplicate(error)) throw error
}
