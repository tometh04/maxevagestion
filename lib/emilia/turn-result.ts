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
  const flightsRaw = metaCombined?.flights ?? data.results?.flights ?? data.flights
  const hotelsRaw = metaCombined?.hotels ?? data.results?.hotels ?? data.hotels
  const flightsData = Array.isArray(flightsRaw)
    ? { count: flightsRaw.length, items: flightsRaw }
    : flightsRaw
  const hotelsData = Array.isArray(hotelsRaw)
    ? { count: hotelsRaw.length, items: hotelsRaw }
    : hotelsRaw
  const transformedFlights = flightsData?.items ? transformFlights(flightsData.items) : undefined
  const transformedHotels = hotelsData?.items ? transformHotels(hotelsData.items) : undefined
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
