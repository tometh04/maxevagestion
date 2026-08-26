import { buildAssistantContent, generateClientId, generateTitle } from "@/lib/emilia/utils"
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
  if (outcome.type !== "search_results" && outcome.type !== "no_results") return []
  return Array.isArray(outcome?.results?.result_sets) ? outcome.results.result_sets : []
}

function canonicalRequestType(flights: any, hotels: any): string | undefined {
  if (flights && hotels) return "combined"
  if (flights) return "flights"
  if (hotels) return "hotels"
  return undefined
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
  const flightItems = flightSet
    ? transformCanonicalFlights(Array.isArray(flightSet.data) ? flightSet.data : [], flightSet.query || {})
    : undefined
  const hotelItems = hotelSet
    ? transformCanonicalHotels(Array.isArray(hotelSet.data) ? hotelSet.data : [], hotelSet.query || {})
    : undefined
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
    ...(searchContextId ? { searchContextId } : {}),
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
