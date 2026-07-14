import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { generateClientId, generateRequestIdFromClientId } from "@/lib/emilia/utils"
import { persistEmiliaTurnFailure, persistEmiliaTurnResult } from "@/lib/emilia/turn-result"
import {
  canAccessEmiliaLeadAgency,
  resolveEmiliaOrganizationAccess,
  resolveLeadEmiliaAccess,
} from "@/lib/emilia/access"
import { enforceUserRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
})

function getAsyncEmiliaUrl() {
  if (process.env.EMILIA_API_ASYNC_URL) return process.env.EMILIA_API_ASYNC_URL
  const configured = process.env.EMILIA_API_URL
  if (!configured) return "https://api.vibook.ai/v1/emilia/turns"
  return configured.endsWith("/turn") ? `${configured}s` : configured
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const rateLimitBlock = enforceUserRateLimit(user.id, "/api/emilia/chat:POST", "AI_COPILOT")
    if (rateLimitBlock) return rateLimitBlock

    const parsedBody = chatRequestSchema.safeParse(await request.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Solicitud inválida", details: parsedBody.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { message, conversationId, clientId } = parsedBody.data
    const supabase = await createServerClient()
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("org_id", user.org_id)
      .eq("user_id", user.id)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 })
    }

    const leadId = (conversation as any).lead_id as string | null | undefined
    if (leadId) {
      const leadAccess = await resolveLeadEmiliaAccess(supabase, user)
      if (!leadAccess.allowed) {
        return NextResponse.json(
          { error: leadAccess.message, code: leadAccess.code },
          { status: leadAccess.status }
        )
      }
      const { data: lead } = await supabase
        .from("leads")
        .select("id, agency_id")
        .eq("id", leadId)
        .eq("org_id", user.org_id)
        .maybeSingle()
      if (!lead || !canAccessEmiliaLeadAgency(leadAccess, (lead as any).agency_id)) {
        return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
      }
    } else {
      const organizationAccess = await resolveEmiliaOrganizationAccess(supabase, user)
      if (!organizationAccess.allowed) {
        return NextResponse.json(
          { error: organizationAccess.message, code: organizationAccess.code },
          { status: organizationAccess.status }
        )
      }
    }

    const userClientId = clientId || generateClientId()
    const requestId = generateRequestIdFromClientId(userClientId)
    const userContent = {
      text: message,
      metadata: { emilia_job: { request_id: requestId, status: "dispatching" } },
    }
    const { error: userMessageError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: userContent,
      client_id: userClientId,
      api_request_id: requestId,
    } as any)
    const duplicateUserMessage = userMessageError?.code === "23505"
      || userMessageError?.message?.includes("duplicate")
      || userMessageError?.message?.includes("unique")
    if (userMessageError && !duplicateUserMessage) {
      console.error("Error saving user message:", userMessageError)
      return NextResponse.json({ error: "Error al guardar mensaje" }, { status: 500 })
    }

    const apiKey = process.env.EMILIA_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "Emilia no está configurada. Contactá al administrador para configurar EMILIA_API_KEY." },
        { status: 503 }
      )
    }

    const apiPayload = {
      request_id: requestId,
      external_conversation_ref: conversationId,
      message,
      mode: "agency",
      workspace_mode: "standard",
      language: "es",
    }
    const configuredTimeout = Number(process.env.EMILIA_API_DISPATCH_TIMEOUT_MS || 15_000)
    const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 15_000
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetch(getAsyncEmiliaUrl(), {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
          "User-Agent": "Emilia-API-Client/1.0 (https://app.vibook.ai)",
          "Origin": "https://app.vibook.ai",
        },
        body: JSON.stringify(apiPayload),
        signal: controller.signal,
        cache: "no-store",
      })
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return NextResponse.json(
          { error: "No se pudo iniciar la búsqueda de Emilia. Intentá nuevamente." },
          { status: 504 }
        )
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }

    const data = await response.json().catch(async () => ({ message: await response.text().catch(() => "") }))
    if (!response.ok) {
      console.error("[Emilia API] Error:", {
        status: response.status,
        message: data?.error?.message || data?.message,
        orgId: user.org_id,
        userId: user.id,
        requestId,
      })
      if (response.status === 429) {
        return NextResponse.json({ error: "Demasiadas solicitudes. Por favor, espera un momento." }, { status: 429 })
      }
      if (response.status === 401) {
        return NextResponse.json({ error: "API key inválida o expirada. Contactá al administrador." }, { status: 401 })
      }
      if (response.status === 403) {
        return NextResponse.json({ error: "Sin permisos para realizar búsquedas. Contactá al administrador." }, { status: 403 })
      }
      return NextResponse.json(
        { error: data?.error?.message || `Error al iniciar la búsqueda (${response.status})` },
        { status: response.status }
      )
    }

    if (data.status === "queued" || data.status === "processing") {
      await supabase
        .from("messages")
        .update({
          content: {
            text: message,
            metadata: {
              emilia_job: {
                job_id: data.job_id,
                request_id: data.request_id || requestId,
                status: data.status,
              },
            },
          },
        } as any)
        .eq("conversation_id", conversationId)
        .eq("client_id", userClientId)

      return NextResponse.json({
        job_id: data.job_id,
        request_id: data.request_id || requestId,
        status: data.status,
        stage: data.stage,
        poll_after_ms: data.poll_after_ms || 1500,
      }, { status: 202 })
    }

    if (data.status === "failed") {
      const failureMessage = data?.error?.message || "Emilia no pudo completar la búsqueda. Intentá nuevamente."
      await persistEmiliaTurnFailure({
        supabase,
        conversationId,
        requestId,
        jobId: data.job_id,
        message: failureMessage,
      })
      await supabase
        .from("messages")
        .update({
          content: {
            text: message,
            metadata: { emilia_job: { job_id: data.job_id, request_id: requestId, status: "failed" } },
          },
        } as any)
        .eq("conversation_id", conversationId)
        .eq("client_id", userClientId)
      return NextResponse.json({ status: "failed", error: { message: failureMessage } }, { status: 502 })
    }

    const result = data.result || data
    const normalized = await persistEmiliaTurnResult({
      supabase,
      conversation,
      conversationId,
      orgId: user.org_id,
      userId: user.id,
      requestId: data.request_id || requestId,
      data: result,
      jobId: data.job_id,
    })
    if (data.job_id) {
      await supabase
        .from("messages")
        .update({
          content: {
            text: message,
            metadata: { emilia_job: { job_id: data.job_id, request_id: data.request_id || requestId, status: "completed" } },
          },
        } as any)
        .eq("conversation_id", conversationId)
        .eq("client_id", userClientId)
    }
    return NextResponse.json(normalized)
  } catch (error: any) {
    console.error("Error en /api/emilia/chat:", error?.message || error)
    return NextResponse.json({ error: error?.message || "Error interno del servidor" }, { status: 500 })
  }
}
