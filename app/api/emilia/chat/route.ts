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

        console.log("[Emilia API] Enviando request a:", EMILIA_API_URL)
        console.log("[Emilia API] API Key (primeros 15):", EMILIA_API_KEY?.substring(0, 15))
        console.log("[Emilia API] Payload:", JSON.stringify(apiPayload, null, 2))

        const response = await fetch(EMILIA_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${EMILIA_API_KEY}`,
                "X-API-Key": EMILIA_API_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(apiPayload),
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error("[Emilia API] Error response:", response.status, errorText)

            let errorData: any
            try {
                errorData = JSON.parse(errorText)
            } catch {
                errorData = { message: errorText }
            }

            if (response.status === 429) {
                return NextResponse.json(
                    { error: "Demasiadas solicitudes. Por favor, espera un momento." },
                    { status: 429 }
                )
            }

            if (response.status === 401) {
                return NextResponse.json(
                    { error: "API key inválida o expirada. Contactá al administrador." },
                    { status: 401 }
                )
            }

            if (response.status === 403) {
                return NextResponse.json(
                    { error: "Sin permisos para realizar búsquedas. Contactá al administrador." },
                    { status: 403 }
                )
            }

            if (response.status === 500) {
                // Manejo específico para errores 500 de la API externa
                const errorMessage = errorData?.error?.message || errorData?.message || "Error interno de la API de búsqueda"
                return NextResponse.json(
                    {
                        error: `Error de búsqueda: ${errorMessage}. Intentá reformular tu búsqueda o contactá al administrador si el problema persiste.`,
                        details: errorData
                    },
                    { status: 500 }
                )
            }

            return NextResponse.json(
                {
                    error: `Error al procesar la búsqueda (${response.status})`,
                    details: errorData
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
            await supabase
                .from("conversations")
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
        const transformedFlights = data.results?.flights?.items
            ? transformFlights(data.results.flights.items)
            : undefined

        const transformedHotels = data.results?.hotels?.items
            ? transformHotels(data.results.hotels.items)
            : undefined

        // 7. Guardar mensaje del asistente
        const assistantClientId = generateClientId()
        const assistantContent = {
            text: buildAssistantContent(data),
            cards: (transformedFlights || transformedHotels) ? {
                flights: transformedFlights ? {
                    count: data.results.flights.count,
                    items: transformedFlights
                } : undefined,
                hotels: transformedHotels ? {
                    count: data.results.hotels.count,
                    items: transformedHotels
                } : undefined,
            } : undefined,
            metadata: {
                search_id: data.search_id,
                results_count: (data.results?.flights?.count || 0) + (data.results?.hotels?.count || 0),
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

        // 8. Actualizar contexto y título de la conversación
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

        await supabase
            .from("conversations")
            .update(updates)
            .eq("id", conversationId)

        // 9. Retornar respuesta completa con datos transformados
        return NextResponse.json({
            ...data,
            results: {
                ...data.results,
                flights: transformedFlights ? {
                    count: data.results.flights.count,
                    items: transformedFlights
                } : undefined,
                hotels: transformedHotels ? {
                    count: data.results.hotels.count,
                    items: transformedHotels
                } : undefined,
            },
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

