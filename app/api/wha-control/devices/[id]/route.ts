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
  const supabase = createAdminClient()

  // Stop connector socket first
  await callConnector(`/devices/${id}/stop`, "POST")

  const db = supabase as any

  // Delete associated data: messages first (FK to chats), then chats
  await db.from("wa_messages").delete().eq("device_id", id)
  await db.from("wa_chats").delete().eq("device_id", id)

  // Soft delete the device itself
  await db.from("wa_devices").update({ is_active: false, status: "DISCONNECTED" }).eq("id", id)

  return NextResponse.json({ ok: true })
}
