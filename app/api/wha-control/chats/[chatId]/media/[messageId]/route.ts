import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { callConnector } from "@/lib/wha-control/connector-client"

/**
 * Sirve la media (imagen/audio/video/doc) de un mensaje, bajándola on-demand del
 * connector (Baileys). No se guarda nada: se devuelve al browser con su
 * Content-Type para que <img>/<audio> la usen directo. El browser la cachea por
 * un rato. Puede fallar si la media de WhatsApp ya expiró.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string; messageId: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { messageId } = await params

  // adminDb justificado: wa_messages tiene org_id; validamos que el mensaje sea
  // del tenant del caller antes de pedirle la media al connector.
  const supabase = createAdminClient() as any
  const { data: msg } = await supabase
    .from("wa_messages")
    .select("device_id, wa_message_id")
    .eq("id", messageId)
    .eq("org_id", auth.orgId)
    .maybeSingle()

  if (!msg) {
    return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 })
  }

  const result = await callConnector(
    `/devices/${msg.device_id}/media`,
    "POST",
    { waMessageId: msg.wa_message_id },
    30000
  )

  if (!result.ok || !result.data?.dataBase64) {
    return NextResponse.json(
      { error: result.error || "No se pudo obtener la media" },
      { status: 502 }
    )
  }

  const buffer = Buffer.from(result.data.dataBase64 as string, "base64")
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": result.data.mimeType || "application/octet-stream",
      // Cache en el browser por sesión para no re-bajar en cada re-render (poll 30s).
      "Cache-Control": "private, max-age=3600",
    },
  })
}
