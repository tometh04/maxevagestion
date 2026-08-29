import { getCurrentUser } from "@/lib/auth"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import {
  canAccessEmiliaLeadAgency,
  resolveEmiliaOrganizationAccess,
  resolveLeadEmiliaAccess,
} from "@/lib/emilia/access"
import { persistEmiliaTurnFailure, persistEmiliaTurnResult } from "@/lib/emilia/turn-result"
import { z } from "zod"
import { resolveAgencyEmiliaCredential } from "@/lib/emilia/agency-credential"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"

const paramsSchema = z.object({ jobId: z.string().uuid() })
const querySchema = z.object({ conversationId: z.string().uuid() })

function getAsyncEmiliaUrl() {
  if (process.env.EMILIA_API_ASYNC_URL) return process.env.EMILIA_API_ASYNC_URL.replace(/\/$/, "")
  const configured = process.env.EMILIA_API_URL
  if (!configured) return "https://api.vibook.ai/v1/emilia/turns"
  return (configured.endsWith("/turn") ? `${configured}s` : configured).replace(/\/$/, "")
}

async function updateUserJobStatus(
  supabase: any,
  conversationId: string,
  requestId: string,
  jobId: string,
  status: "completed" | "failed"
) {
  const { data: userMessage } = await supabase
    .from("messages")
    .select("id, content")
    .eq("conversation_id", conversationId)
    .eq("api_request_id", requestId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!userMessage) return

  const content = userMessage.content && typeof userMessage.content === "object" ? userMessage.content : {}
  const metadata = content.metadata && typeof content.metadata === "object" ? content.metadata : {}
  await supabase
    .from("messages")
    .update({
      content: {
        ...content,
        metadata: {
          ...metadata,
          emilia_job: { job_id: jobId, request_id: requestId, status },
        },
      },
    })
    .eq("id", userMessage.id)
    .eq("conversation_id", conversationId)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    if (!user.org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const parsedParams = paramsSchema.safeParse(await params)
    const parsedQuery = querySchema.safeParse({
      conversationId: new URL(request.url).searchParams.get("conversationId"),
    })
    if (!parsedParams.success || !parsedQuery.success) {
      return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 })
    }

    const { jobId } = parsedParams.data
    const { conversationId } = parsedQuery.data
    const supabase = await createServerClient()
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("org_id", user.org_id)
      .eq("user_id", user.id)
      .single()
    if (conversationError || !conversation) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 })
    }

    const leadId = (conversation as any).lead_id as string | null | undefined
    let agencyId: string
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
        .select("id, agency_id, assigned_seller_id")
        .eq("id", leadId)
        .eq("org_id", user.org_id)
        .maybeSingle()
      if (!lead || !canAccessEmiliaLeadAgency(
        leadAccess,
        (lead as any).agency_id,
        (lead as any).assigned_seller_id
      )) {
        return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
      }
      agencyId = (lead as any).agency_id
    } else {
      const access = await resolveEmiliaOrganizationAccess(supabase, user)
      if (!access.allowed) {
        return NextResponse.json({ error: access.message, code: access.code }, { status: access.status })
      }
      const agencyScope = await resolveAgencyPermissionScope(supabase, user, "leads", "write")
      if (agencyScope.agencyIds.length !== 1) {
        return NextResponse.json(
          {
            error: agencyScope.agencyIds.length === 0
              ? "No tiene una agencia habilitada para usar Emilia."
              : "No se puede atribuir esta búsqueda a una única agencia.",
            code: "emilia_agency_required",
          },
          { status: 409 }
        )
      }
      agencyId = agencyScope.agencyIds[0]
    }

    let apiKey: string
    try {
      apiKey = (await resolveAgencyEmiliaCredential({
        admin: createAdminClient(),
        orgId: user.org_id,
        agencyId,
      })).apiKey
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "La agencia no tiene una credencial válida de Emilia.",
          code: "emilia_agency_credential_unavailable",
        },
        { status: 503 }
      )
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    let response: Response
    try {
      response = await fetch(`${getAsyncEmiliaUrl()}/${jobId}`, {
        headers: {
          "X-API-Key": apiKey,
          "User-Agent": "Emilia-API-Client/1.0 (https://app.vibook.ai)",
        },
        signal: controller.signal,
        cache: "no-store",
      })
    } finally {
      clearTimeout(timeout)
    }

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "No se pudo consultar la búsqueda de Emilia" },
        { status: response.status }
      )
    }
    if (data.external_conversation_ref !== conversationId) {
      return NextResponse.json({ error: "Búsqueda no encontrada" }, { status: 404 })
    }

    if (data.status === "completed") {
      if (!data.result) {
        return NextResponse.json({ error: "Emilia completó el job sin resultado" }, { status: 502 })
      }
      const normalized = await persistEmiliaTurnResult({
        supabase,
        conversation,
        conversationId,
        orgId: user.org_id,
        userId: user.id,
        requestId: data.request_id,
        data: data.result,
        jobId,
      })
      await updateUserJobStatus(supabase, conversationId, data.request_id, jobId, "completed")
      return NextResponse.json(normalized)
    }

    if (data.status === "failed") {
      const message = data?.error?.message || "Emilia no pudo completar la búsqueda. Intentá nuevamente."
      await persistEmiliaTurnFailure({
        supabase,
        conversationId,
        requestId: data.request_id,
        jobId,
        message,
      })
      await updateUserJobStatus(supabase, conversationId, data.request_id, jobId, "failed")
      return NextResponse.json({ status: "failed", job_id: jobId, error: { message } })
    }

    return NextResponse.json({
      job_id: jobId,
      request_id: data.request_id,
      status: data.status,
      stage: data.stage,
      poll_after_ms: data.poll_after_ms || 1500,
    })
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return NextResponse.json({ error: "No se pudo consultar Emilia a tiempo" }, { status: 504 })
    }
    console.error("Error in GET /api/emilia/chat/jobs/[jobId]:", error)
    return NextResponse.json({ error: error?.message || "Error interno del servidor" }, { status: 500 })
  }
}
