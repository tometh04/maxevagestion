import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import {
    generateRequestId,
    generateClientId,
    generateTitle,
    buildAssistantContent,
} from "@/lib/emilia/utils"
import { transformFlights, transformHotels } from "@/lib/emilia/transformers"

interface ChatRequest {
    message: string
    conversationId: string
    clientId?: string
}

export async function POST(request: Request) {
    try {
        const { user } = await getCurrentUser()
        if (!user) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const body: ChatRequest = await request.json()
        const { message, conversationId, clientId } = body

        if (!message?.trim()) {
            return NextResponse.json(
                { error: "El mensaje es requerido" },
                { status: 400 }
            )
        }

        if (!conversationId) {
            return NextResponse.json(
                { error: "conversationId es requerido" },
                { status: 400 }
            )
        }

        const supabase = await createServerClient()

        // 1. Cargar conversación de la DB
        const { data: conversation, error: convError } = await supabase
            .from("conversations")
            .select("*")
            .eq("id", conversationId)
            .eq("user_id", user.id)
            .single()

        if (convError || !conversation) {
            return NextResponse.json(
                { error: "Conversación no encontrada" },
                { status: 404 }
            )
        }

        // 2. Obtener últimos 10 mensajes para contexto
        const { data: recentMessages } = await supabase
            .from("messages")
            .select("role, content, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(10)

        const conversationHistory = (recentMessages || [])
            .reverse()
            .map((msg: any) => ({
                role: msg.role,
                content: msg.content?.text || "",
                timestamp: msg.created_at,
            }))

        // 3. Guardar mensaje del usuario en la DB
        const userClientId = clientId || generateClientId()
        const requestId = generateRequestId()

        const { error: userMsgError } = await (supabase.from("messages") as any)
            .insert({
                conversation_id: conversationId,
                role: "user",
                content: { text: message },
                client_id: userClientId,
                api_request_id: requestId,
            })

        if (userMsgError) {
            // Si es error de duplicado, ignorar (idempotencia)
            if (!userMsgError.message?.includes("duplicate") && !userMsgError.message?.includes("unique")) {
                console.error("Error saving user message:", userMsgError)
                return NextResponse.json(
                    { error: "Error al guardar mensaje" },
                    { status: 500 }
                )
            }
        }

        // 4. Configuración de la API externa
        const EMILIA_API_URL = process.env.EMILIA_API_URL || "https://api.vibook.ai/search"
        const EMILIA_API_KEY = process.env.EMILIA_API_KEY

        // LOGS TEMPORALES PARA DEBUGGING
        console.log("=== [Emilia API DEBUG] Inicio ===")
        console.log("[Emilia API] URL:", EMILIA_API_URL)
        console.log("[Emilia API] API Key presente:", !!EMILIA_API_KEY)
        console.log("[Emilia API] API Key prefix:", EMILIA_API_KEY?.substring(0, 20) + "...")
        console.log("[Emilia API] API Key length:", EMILIA_API_KEY?.length)
        console.log("[Emilia API] Request host:", request.headers.get('host'))
        console.log("[Emilia API] Request origin:", request.headers.get('origin'))
        console.log("[Emilia API] Request referer:", request.headers.get('referer'))
        console.log("[Emilia API] User ID:", user.id)
        console.log("[Emilia API] Conversation ID:", conversationId)
        console.log("[Emilia API] Message:", message.substring(0, 50))

        if (!EMILIA_API_KEY) {
            console.error("EMILIA_API_KEY no configurada en .env.local")
            return NextResponse.json(
                { error: "Emilia no está configurada. Contactá al administrador para configurar EMILIA_API_KEY." },
                { status: 503 }
            )
        }

        // 5. Llamar a la API externa con contexto
        const apiPayload = {
            request_id: requestId,
            prompt: message,
            context: {
                previous_request: (conversation as any).last_search_context,
                conversation_history: conversationHistory,
            },
            options: {
                language: "es",
                include_metadata: true,
            },
            external_conversation_ref: conversationId,
        }

        console.log("[Emilia API] Payload:", JSON.stringify(apiPayload, null, 2))
        console.log("[Emilia API] Enviando request a Vibook...")

        const response = await fetch(EMILIA_API_URL, {
            method: "POST",
            headers: {
                "X-API-Key": EMILIA_API_KEY,
                "Content-Type": "application/json",
                "User-Agent": "Emilia-API-Client/1.0 (https://www.maxevagestion.com)",
                "Origin": "https://www.maxevagestion.com",
            },
            body: JSON.stringify(apiPayload),
        })

        console.log("[Emilia API] Response status:", response.status)
        console.log("[Emilia API] Response headers:", Object.fromEntries(response.headers.entries()))

        if (!response.ok) {
            const errorText = await response.text()

            // LOGS DETALLADOS DE ERROR
            console.error("=== [Emilia API ERROR] ===")
            console.error("[Emilia API] Status code:", response.status)
            console.error("[Emilia API] Status text:", response.statusText)
            console.error("[Emilia API] Error body:", errorText)

            let errorData: any
            try {
                errorData = JSON.parse(errorText)
                console.error("[Emilia API] Error JSON:", JSON.stringify(errorData, null, 2))
            } catch {
                console.error("[Emilia API] Error no es JSON válido")
                errorData = { message: errorText }
            }

            console.error("[Emilia API] Resumen del request que falló:")
            console.error("  - URL:", EMILIA_API_URL)
            console.error("  - API Key prefix:", EMILIA_API_KEY?.substring(0, 25) + "...")
            console.error("  - Host:", request.headers.get('host'))
            console.error("  - Origin:", request.headers.get('origin'))
            console.error("  - Referer:", request.headers.get('referer'))
            console.error("=== [Fin Emilia API ERROR] ===")

            if (response.status === 429) {
                return NextResponse.json(
                    { error: "Demasiadas solicitudes. Por favor, espera un momento." },
                    { status: 429 }
                )
            }

            if (response.status === 401) {
                return NextResponse.json(
                    {
                        error: "API key inválida o expirada. Contactá al administrador.",
                        debug: process.env.NODE_ENV === 'development' ? {
                            apiKeyPrefix: EMILIA_API_KEY?.substring(0, 20),
                            errorDetails: errorData
                        } : undefined
                    },
                    { status: 401 }
                )
            }

            if (response.status === 403) {
                return NextResponse.json(
                    {
                        error: "Sin permisos para realizar búsquedas. Contactá al administrador.",
                        debug: process.env.NODE_ENV === 'development' ? {
                            apiKeyPrefix: EMILIA_API_KEY?.substring(0, 20),
                            host: request.headers.get('host'),
                            errorDetails: errorData
                        } : undefined
                    },
                    { status: 403 }
                )
            }

            return NextResponse.json(
                {
                    error: `Error al procesar la búsqueda (${response.status})`,
                    debug: process.env.NODE_ENV === 'development' ? errorData : undefined
                },
                { status: response.status }
            )
        }

        const data = await response.json()
        console.log("[Emilia API] Response data:", JSON.stringify(data, null, 2))

        // Manejar caso de información incompleta
        if (data.status === "incomplete" || data.request_type === "missing_info_request") {
            console.log("[Emilia API] Incomplete request detected")

            // Guardar mensaje del asistente pidiendo más información
            const assistantClientId = generateClientId()
            const assistantContent = {
                text: data.message || "Necesito más información para completar la búsqueda. ¿Podrías especificar las fechas, cantidad de personas y destino?",
                metadata: {
                    request_type: "missing_info_request",
                    missing_fields: data.missing_fields || [],
                    suggested_followups: data.suggested_followups || [],
                },
            }

            await (supabase.from("messages") as any)
                .insert({
                    conversation_id: conversationId,
                    role: "assistant",
                    content: assistantContent,
                    client_id: assistantClientId,
                    api_request_id: requestId,
                    api_search_id: data.search_id,
                })

            // Actualizar conversación
            await (supabase.from("conversations") as any)
                .update({ last_message_at: new Date().toISOString() })
                .eq("id", conversationId)

            return NextResponse.json({
                status: "incomplete",
                message: assistantContent.text,
                missing_fields: data.missing_fields || [],
                suggested_followups: data.suggested_followups || [],
                timestamp: new Date().toISOString(),
            })
        }

        // 6. Transformar los datos de la API al formato del frontend
        // La API puede devolver resultados en dos formatos:
        // 1. data.results.flights (formato anidado)
        // 2. data.flights (formato plano)
        const flightsData = data.results?.flights || data.flights
        const hotelsData = data.results?.hotels || data.hotels

        const transformedFlights = flightsData?.items
            ? transformFlights(flightsData.items)
            : undefined

        const transformedHotels = hotelsData?.items
            ? transformHotels(hotelsData.items)
            : undefined

        // Construir objetos de resultados transformados
        const resultsFlights = transformedFlights
            ? {
                count: flightsData.count,
                items: transformedFlights,
            }
            : flightsData

        const resultsHotels = transformedHotels
            ? {
                count: hotelsData.count,
                items: transformedHotels,
            }
            : hotelsData

        // 7. Guardar mensaje del asistente
        // Normalizar data para buildAssistantContent (debe tener results)
        const normalizedDataForContent = {
            ...data,
            results: resultsFlights || resultsHotels ? {
                flights: resultsFlights,
                hotels: resultsHotels,
            } : data.results,
        }

        const assistantClientId = generateClientId()
        const assistantContent = {
            text: buildAssistantContent(normalizedDataForContent),
            cards: resultsFlights || resultsHotels ? {
                flights: resultsFlights,
                hotels: resultsHotels,
                requestType: data.requestType || (resultsFlights && resultsHotels ? 'combined' : resultsFlights ? 'flights-only' : 'hotels-only'),
            } : undefined,
            metadata: {
                search_id: data.search_id,
                results_count: (resultsFlights?.count || 0) + (resultsHotels?.count || 0),
            },
        }

        const { error: assistantMsgError } = await (supabase.from("messages") as any)
            .insert({
                conversation_id: conversationId,
                role: "assistant",
                content: assistantContent,
                client_id: assistantClientId,
                api_request_id: requestId,
                api_search_id: data.search_id,
            })

        if (assistantMsgError) {
            console.error("Error saving assistant message:", assistantMsgError)
        }

        // 7. Actualizar contexto y título de la conversación
        const updates: any = {
            last_message_at: new Date().toISOString(),
        }

        // Guardar contexto para próxima búsqueda
        if (data.context_management?.action === "save" && data.context_management?.context_to_save) {
            updates.last_search_context = data.context_management.context_to_save
        } else if (data.parsed_request) {
            updates.last_search_context = data.parsed_request
        }

        // Generar título automático si es la primera búsqueda exitosa
        if ((conversation as any).title?.startsWith("Chat ") && data.status === "completed" && data.parsed_request) {
            updates.title = generateTitle(data.parsed_request)
        }

        await (supabase.from("conversations") as any)
            .update(updates)
            .eq("id", conversationId)

        // 8. Asegurar que siempre haya un status válido
        // Si la API no devuelve status, inferirlo de los resultados
        let responseStatus = data.status
        if (!responseStatus) {
            if (flightsData || hotelsData) {
                responseStatus = "completed"
            } else if (data.message && !data.error) {
                responseStatus = "completed" // Asumir completado si hay mensaje sin error
            } else {
                responseStatus = "completed" // Default a completed
            }
        }

        // 8. Retornar respuesta completa con datos transformados
        // Normalizar la estructura para que siempre tenga results
        const normalizedResults = resultsFlights || resultsHotels ? {
            flights: resultsFlights,
            hotels: resultsHotels,
        } : (data.results || (flightsData || hotelsData ? {
            flights: resultsFlights,
            hotels: resultsHotels,
        } : undefined))

        return NextResponse.json({
            ...data,
            status: responseStatus, // Asegurar que siempre haya status
            results: normalizedResults,
            requestType: data.requestType || (resultsFlights && resultsHotels ? 'combined' : resultsFlights ? 'flights-only' : 'hotels-only'),
            timestamp: new Date().toISOString(),
            conversationTitle: updates.title || (conversation as any).title,
        })
    } catch (error: any) {
        console.error("Error en /api/emilia/chat:", error?.message || error)
        return NextResponse.json(
            { error: error?.message || "Error interno del servidor" },
            { status: 500 }
        )
    }
}

