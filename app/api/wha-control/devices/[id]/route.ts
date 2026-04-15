import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { callConnector } from "@/lib/wha-control/connector-client"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { id } = await params
  const supabase = createAdminClient() as any

  // Stop connector socket first (best effort)
  await callConnector(`/devices/${id}/stop`, "POST")

  // Delete associated data: messages first (FK to chats), then chats
  const { error: msgErr } = await supabase.from("wa_messages").delete().eq("device_id", id)
  if (msgErr) {
    return NextResponse.json({ error: `Error eliminando mensajes: ${msgErr.message}` }, { status: 500 })
  }

  const { error: chatErr } = await supabase.from("wa_chats").delete().eq("device_id", id)
  if (chatErr) {
    return NextResponse.json({ error: `Error eliminando chats: ${chatErr.message}` }, { status: 500 })
  }

  // Soft delete the device itself
  const { error: devErr } = await supabase
    .from("wa_devices")
    .update({ is_active: false, status: "DISCONNECTED" })
    .eq("id", id)

  if (devErr) {
    return NextResponse.json({ error: `Error eliminando dispositivo: ${devErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
