import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { callConnector } from "@/lib/wha-control/connector-client"

/**
 * Dispara un backfill de historial en el connector (Baileys fetchMessageHistory).
 * El sync es asíncrono y best-effort: el connector persiste los mensajes viejos
 * en wa_messages a medida que llegan. La UI re-consulta la base después.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { chatId } = await params

  // adminDb justificado: wa_chats tiene org_id; pre-validamos el chat contra el
  // orgId del caller antes de resolver device/remote_jid.
  const supabase = createAdminClient() as any

  const { data: chat } = await supabase
    .from("wa_chats")
    .select("id, device_id, remote_jid")
    .eq("id", chatId)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (!chat) {
    return NextResponse.json({ error: "Chat no encontrado" }, { status: 404 })
  }

  const result = await callConnector(
    `/devices/${chat.device_id}/sync-history`,
    "POST",
    { remoteJid: chat.remote_jid, count: 50 },
    15000
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "No se pudo pedir el historial" },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true, requested: true })
}
