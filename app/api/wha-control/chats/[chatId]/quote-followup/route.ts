import { NextResponse } from "next/server"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_WHA_QUOTE_FOLLOWUP } from "@/lib/feature-flags"
import { computeScheduledFor } from "@/lib/wha-control/quote-followups"

const markSchema = z.object({
  // _chatIds del merge de conversaciones partidas por LID (incluye chatId).
  chatIds: z.array(z.string().uuid()).max(4).optional(),
})

const cancelSchema = z.object({
  followupId: z.string().uuid(),
})

/** Marca el chat como "cotización enviada" y agenda el seguimiento. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { chatId } = await params

  let parsed: z.infer<typeof markSchema>
  try {
    const body = await request.json().catch(() => ({}))
    const result = markSchema.safeParse(body ?? {})
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || "Payload inválido" },
        { status: 400 }
      )
    }
    parsed = result.data
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  // adminDb justificado: wa_chats/wa_quote_followups tienen org_id; se
  // pre-valida todo contra el orgId del caller antes de escribir.
  const supabase = createAdminClient() as any

  const flagOn = await getOrgFeatureFlag(
    supabase,
    auth.orgId,
    FEATURE_FLAG_WHA_QUOTE_FOLLOWUP
  )
  if (!flagOn) {
    return NextResponse.json(
      { error: "Seguimiento automático no habilitado" },
      { status: 403 }
    )
  }

  const { data: chat } = await supabase
    .from("wa_chats")
    .select("id, device_id, remote_jid, is_group")
    .eq("id", chatId)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (!chat) {
    return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 })
  }
  if (chat.is_group) {
    return NextResponse.json(
      { error: "No se puede agendar seguimiento en un grupo" },
      { status: 400 }
    )
  }

  // Validar los chats linkeados (merge LID) contra org y device.
  const linkedIds = Array.from(new Set([...(parsed.chatIds ?? []), chat.id]))
  if (linkedIds.length > 1) {
    const { data: linked } = await supabase
      .from("wa_chats")
      .select("id")
      .in("id", linkedIds)
      .eq("org_id", auth.orgId)
      .eq("device_id", chat.device_id)
    if ((linked ?? []).length !== linkedIds.length) {
      return NextResponse.json(
        { error: "Chats vinculados inválidos" },
        { status: 400 }
      )
    }
  }

  const { data: settings } = await supabase
    .from("wa_followup_settings")
    .select("wait_hours, message_text, send_window_from, send_window_to")
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (!settings || !settings.message_text?.trim()) {
    return NextResponse.json(
      {
        error:
          "Configurá el seguimiento primero (pestaña Seguimientos de WHA Control)",
      },
      { status: 409 }
    )
  }

  const markedAt = new Date()
  const scheduledFor = computeScheduledFor(markedAt, settings.wait_hours, {
    from: settings.send_window_from,
    to: settings.send_window_to,
  })

  const { data: inserted, error } = await supabase
    .from("wa_quote_followups")
    .insert({
      org_id: auth.orgId,
      device_id: chat.device_id,
      chat_id: chat.id,
      linked_chat_ids: linkedIds,
      remote_jid: chat.remote_jid,
      marked_by: auth.user.id,
      marked_at: markedAt.toISOString(),
      scheduled_for: scheduledFor.toISOString(),
      message_text: settings.message_text,
    })
    .select("id, status, scheduled_for")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Este chat ya tiene un seguimiento activo" },
        { status: 409 }
      )
    }
    console.error("[quote-followup] insert error:", error)
    return NextResponse.json(
      { error: "No se pudo agendar el seguimiento" },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, followup: inserted })
}

/** Cancela manualmente un seguimiento agendado (aún PENDING). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  await params // chatId no se usa: el followupId es autoritativo y se valida por org

  let parsed: z.infer<typeof cancelSchema>
  try {
    const body = await request.json()
    const result = cancelSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0]?.message || "Payload inválido" },
        { status: 400 }
      )
    }
    parsed = result.data
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  // adminDb justificado: update CAS filtrado por org_id del caller.
  const supabase = createAdminClient() as any

  const { data: updated, error } = await supabase
    .from("wa_quote_followups")
    .update({
      status: "CANCELLED",
      cancelled_reason: "manual",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.followupId)
    .eq("org_id", auth.orgId)
    .eq("status", "PENDING")
    .select("id")

  if (error) {
    console.error("[quote-followup] cancel error:", error)
    return NextResponse.json(
      { error: "No se pudo cancelar el seguimiento" },
      { status: 500 }
    )
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: "El seguimiento ya no está pendiente" },
      { status: 409 }
    )
  }

  return NextResponse.json({ ok: true })
}
